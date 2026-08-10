/** Sync diagnostics store (FRONTEND_DOCUMENTATION.md §3.4). */
import { Injectable, signal } from '@angular/core';

export type SyncPhase = 'IDLE' | 'SYNCING' | 'ERROR' | 'OFFLINE';

export interface LastReport {
    processed: number;
    skipped: number;
    rejected: number;
    stockConflict: boolean;
}

@Injectable({ providedIn: 'root' })
export class SyncStore {
    readonly phase = signal<SyncPhase>('IDLE');
    readonly pendingCount = signal<number>(0);
    readonly rejectedCount = signal<number>(0);
    readonly unacknowledgedAlerts = signal<number>(0);
    readonly lastSyncAt = signal<number | null>(null);
    readonly lastError = signal<string | null>(null);
    readonly lastReport = signal<LastReport | null>(null);

    setPhase(phase: SyncPhase): void {
        this.phase.set(phase);
    }

    setQueueStats(stats: { pending: number; rejected: number; unacknowledgedAlerts: number }): void {
        this.pendingCount.set(stats.pending);
        this.rejectedCount.set(stats.rejected);
        this.unacknowledgedAlerts.set(stats.unacknowledgedAlerts);
    }

    recordFlush(report: LastReport): void {
        this.lastReport.set(report);
        this.lastSyncAt.set(Date.now());
        this.lastError.set(null);
        this.phase.set('IDLE');
    }

    recordError(message: string): void {
        this.lastError.set(message);
        this.phase.set('ERROR');
    }
}
