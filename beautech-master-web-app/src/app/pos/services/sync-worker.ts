/**
 * Background sync engine — pushes offline transactions to the server.
 * Ported from FRONTEND_DOCUMENTATION.md §7.4 (sync-worker.ts).
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import { db } from '../core/pos-database';
import { uuidv4 } from '../core/uuid';
import { AuthStore } from '../stores/auth.store';
import { NetworkStore } from '../stores/network.store';
import { SyncStore } from '../stores/sync.store';
import { apiErrorMessage } from '../core/api';
import type { OfflineTransactionPayload, SyncReport } from '../core/types';

const POLL_MS = 30_000;
const BATCH_LIMIT = 100;
const MAX_RETRIES = 8;

@Injectable({ providedIn: 'root' })
export class SyncWorker {
    private http = inject(HttpClient);
    private auth = inject(AuthStore);
    private network = inject(NetworkStore);
    private sync = inject(SyncStore);

    private timer: ReturnType<typeof setInterval> | null = null;
    private flushing = false;

    start(): void {
        if (this.timer) return;
        this.refreshQueueStats();
        this.flush();
        this.timer = setInterval(() => this.flush(), POLL_MS);
        window.addEventListener('online', this.onlineFlush);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        window.removeEventListener('online', this.onlineFlush);
    }

    private onlineFlush = () => this.flush();

    async refreshQueueStats(): Promise<void> {
        const [pending, rejected, unacknowledgedAlerts] = await Promise.all([
            db.sync_queue.where('status').equals('PENDING').count(),
            db.sync_queue.where('status').equals('REJECTED').count(),
            db.sync_alerts.where('acknowledged').equals(0).count()
        ]);
        this.sync.setQueueStats({ pending, rejected, unacknowledgedAlerts });
    }

    async flush(): Promise<void> {
        if (this.flushing) return;
        if (!this.network.online()) {
            this.sync.setPhase('OFFLINE');
            return;
        }
        if (!this.auth.accessToken()) return;

        const pending = await db.sync_queue
            .where('status')
            .equals('PENDING')
            .sortBy('created_at');
        if (!pending.length) {
            await this.refreshQueueStats();
            this.sync.setPhase('IDLE');
            return;
        }

        this.flushing = true;
        this.sync.setPhase('SYNCING');

        const batch = pending.slice(0, BATCH_LIMIT);
        const transactions: OfflineTransactionPayload[] = batch.map((row) => JSON.parse(row.payload));

        try {
            const report = await firstValueFrom(
                this.http.post<SyncReport>(`${API_BASE}/sync/flush`, { transactions })
            );

            const byTxId = new Map(batch.map((row) => [JSON.parse(row.payload).id as string, row]));
            let stockConflict = false;

            // Processed → finalize
            for (const p of report.processed ?? []) {
                if (p.stockConflict) {
                    stockConflict = true;
                    await this.createAlert(p.id, 'CRITICAL', 'Stock conflict detected during sync');
                }
                await this.finalize(p.id, byTxId.get(p.id)?.id);
            }
            // Skipped (idempotent replay) → finalize
            for (const s of report.skipped ?? []) {
                await this.finalize(s.id, byTxId.get(s.id)?.id);
            }
            // Rejected → park + WARNING alert
            for (const r of report.rejected ?? []) {
                const row = byTxId.get(r.id);
                if (row) {
                    await db.sync_queue.update(row.id, {
                        status: 'REJECTED',
                        retry_count: row.retry_count + 1
                    });
                }
                await this.createAlert(r.id, 'WARNING', r.reason || 'Transaction rejected by server');
            }

            this.sync.recordFlush({
                processed: report.processed?.length ?? 0,
                skipped: report.skipped?.length ?? 0,
                rejected: report.rejected?.length ?? 0,
                stockConflict
            });
        } catch (err) {
            // Network/server error: increment retries, park after MAX_RETRIES
            for (const row of batch) {
                const retry = row.retry_count + 1;
                if (retry >= MAX_RETRIES) {
                    await db.sync_queue.update(row.id, { status: 'REJECTED', retry_count: retry });
                    await this.createAlert(JSON.parse(row.payload).id, 'WARNING', 'Parked after max retries');
                } else {
                    await db.sync_queue.update(row.id, { retry_count: retry });
                }
            }
            this.sync.recordError(apiErrorMessage(err));
        } finally {
            this.flushing = false;
            await this.refreshQueueStats();
        }
    }

    private async finalize(txId: string, queueRowId?: string): Promise<void> {
        await db.transaction('rw', db.local_transactions, db.sync_queue, async () => {
            await db.local_transactions.update(txId, { synced: 1 });
            if (queueRowId) await db.sync_queue.delete(queueRowId);
        });
    }

    private async createAlert(
        transactionId: string,
        severity: 'CRITICAL' | 'WARNING' | 'INFO',
        message: string
    ): Promise<void> {
        await db.sync_alerts.add({
            id: uuidv4(),
            transaction_id: transactionId,
            severity,
            message,
            acknowledged: 0,
            created_at: new Date().toISOString()
        });
    }

    /** Restore a REJECTED job to PENDING (retry_count reset). */
    async requeue(queueId: string): Promise<void> {
        await db.sync_queue.update(queueId, { status: 'PENDING', retry_count: 0 });
        await this.refreshQueueStats();
    }

    async acknowledgeAlert(alertId: string): Promise<void> {
        await db.sync_alerts.update(alertId, { acknowledged: 1 });
        await this.refreshQueueStats();
    }

    async acknowledgeAllAlerts(): Promise<void> {
        const open = await db.sync_alerts.where('acknowledged').equals(0).toArray();
        await Promise.all(open.map((a) => db.sync_alerts.update(a.id, { acknowledged: 1 })));
        await this.refreshQueueStats();
    }
}
