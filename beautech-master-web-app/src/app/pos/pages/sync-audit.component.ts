/** Sync diagnostics page (FRONTEND_DOCUMENTATION.md §2.3 SyncAudit). */
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { liveQuery, Subscription as DexieSub } from 'dexie';
import { db } from '../core/pos-database';
import { SyncWorker } from '../services/sync-worker';
import { SyncStore } from '../stores/sync.store';
import { NetworkStore } from '../stores/network.store';
import { NotifyService } from '../core/notify.service';
import type { SyncAlertRow, SyncQueueRow } from '../core/types';

@Component({
    selector: 'pos-sync-audit',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="flex flex-col gap-4">
            <!-- KPI row -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Connectivity</div><div class="text-lg font-bold" [class.text-emerald-600]="network.online()" [class.text-rose-600]="!network.online()">{{ network.online() ? 'Online' : 'Offline' }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Pending</div><div class="text-2xl font-bold">{{ sync.pendingCount() }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Rejected</div><div class="text-2xl font-bold text-rose-600">{{ sync.rejectedCount() }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Open alerts</div><div class="text-2xl font-bold text-amber-600">{{ sync.unacknowledgedAlerts() }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Last flush</div><div class="text-sm font-semibold">{{ sync.lastSyncAt() ? (sync.lastSyncAt() | date: 'short') : '—' }}</div></div>
            </div>

            <div class="flex items-center gap-3">
                <button type="button" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast text-sm" (click)="flush()">Flush now</button>
                <span class="text-sm text-muted-color">Phase: <b>{{ sync.phase() }}</b></span>
                <span *ngIf="sync.lastError()" class="text-sm text-rose-600">{{ sync.lastError() }}</span>
            </div>

            <!-- Last batch report -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4" *ngIf="sync.lastReport() as r">
                <h3 class="font-bold mb-2">Last batch report</h3>
                <div class="flex gap-6 text-sm">
                    <span>Processed: <b>{{ r.processed }}</b></span>
                    <span>Skipped: <b>{{ r.skipped }}</b></span>
                    <span>Rejected: <b class="text-rose-600">{{ r.rejected }}</b></span>
                    <span *ngIf="r.stockConflict" class="text-rose-600 font-semibold">⚠ Stock conflict</span>
                </div>
            </div>

            <!-- Alerts -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-bold">Alert trace</h3>
                    <button type="button" class="text-sm text-primary" (click)="ackAll()" [disabled]="!openAlerts().length">Acknowledge all</button>
                </div>
                <div class="flex flex-col gap-2 max-h-72 overflow-auto">
                    <div *ngFor="let a of alerts()" class="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg" [class.bg-rose-50]="a.severity === 'CRITICAL'" [class.bg-amber-50]="a.severity === 'WARNING'" [class.opacity-50]="a.acknowledged === 1">
                        <div>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full mr-2" [class.bg-rose-200]="a.severity === 'CRITICAL'" [class.bg-amber-200]="a.severity === 'WARNING'">{{ a.severity }}</span>
                            {{ a.message }} <span class="text-muted-color">· {{ a.created_at | date: 'short' }}</span>
                        </div>
                        <button type="button" *ngIf="a.acknowledged === 0" class="text-primary text-xs" (click)="ack(a)">Ack</button>
                    </div>
                    <p *ngIf="!alerts().length" class="text-center text-muted-color py-4">No alerts</p>
                </div>
            </div>

            <!-- Parked jobs -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                <h3 class="font-bold mb-3">Parked jobs (rejected)</h3>
                <div class="flex flex-col gap-2">
                    <div *ngFor="let q of rejected()" class="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800">
                        <span class="font-mono text-xs">{{ txId(q) }} · retries {{ q.retry_count }}</span>
                        <button type="button" class="text-primary text-xs" (click)="requeue(q)">Requeue</button>
                    </div>
                    <p *ngIf="!rejected().length" class="text-center text-muted-color py-4">No parked jobs</p>
                </div>
            </div>

            <!-- Pending queue -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                <h3 class="font-bold mb-3">Pending queue</h3>
                <div class="flex flex-col gap-2 max-h-72 overflow-auto">
                    <div *ngFor="let q of pending()" class="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800">
                        <span class="font-mono text-xs">{{ txId(q) }}</span>
                        <span class="text-muted-color">{{ itemCount(q) }} items · {{ method(q) }} · retries {{ q.retry_count }}</span>
                    </div>
                    <p *ngIf="!pending().length" class="text-center text-muted-color py-4">Queue empty</p>
                </div>
            </div>
        </div>
    `
})
export class SyncAuditComponent implements OnInit, OnDestroy {
    private worker = inject(SyncWorker);
    sync = inject(SyncStore);
    network = inject(NetworkStore);
    private notify = inject(NotifyService);

    alerts = signal<SyncAlertRow[]>([]);
    pending = signal<SyncQueueRow[]>([]);
    rejected = signal<SyncQueueRow[]>([]);
    private subs: DexieSub[] = [];

    openAlerts = () => this.alerts().filter((a) => a.acknowledged === 0);

    ngOnInit(): void {
        this.subs.push(liveQuery(() => db.sync_alerts.reverse().sortBy('created_at')).subscribe((a) => this.alerts.set(a)));
        this.subs.push(liveQuery(() => db.sync_queue.where('status').equals('PENDING').sortBy('created_at')).subscribe((q) => this.pending.set(q)));
        this.subs.push(liveQuery(() => db.sync_queue.where('status').equals('REJECTED').toArray()).subscribe((q) => this.rejected.set(q)));
        this.worker.refreshQueueStats();
    }

    ngOnDestroy(): void {
        this.subs.forEach((s) => s.unsubscribe());
    }

    private parse(q: SyncQueueRow): any {
        try {
            return JSON.parse(q.payload);
        } catch {
            return {};
        }
    }
    txId(q: SyncQueueRow): string {
        return (this.parse(q).id ?? q.id).slice(0, 8);
    }
    itemCount(q: SyncQueueRow): number {
        return this.parse(q).items?.length ?? 0;
    }
    method(q: SyncQueueRow): string {
        return this.parse(q).payment?.method ?? '—';
    }

    flush(): void {
        this.worker.flush();
        this.notify.info('Sync flush triggered');
    }
    ack(a: SyncAlertRow): void {
        this.worker.acknowledgeAlert(a.id);
    }
    ackAll(): void {
        this.worker.acknowledgeAllAlerts();
    }
    requeue(q: SyncQueueRow): void {
        this.worker.requeue(q.id);
        this.notify.success('Job requeued');
    }
}
