/** Network online/offline store (FRONTEND_DOCUMENTATION.md §3.3). */
import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkStore {
    private _online = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
    private _lastChangeAt = signal<number>(Date.now());
    private _watching = signal<boolean>(false);

    readonly online = computed(() => this._online());
    readonly lastChangeAt = computed(() => this._lastChangeAt());
    readonly watching = computed(() => this._watching());

    private onlineHandler = () => this.setOnline(true);
    private offlineHandler = () => this.setOnline(false);

    /** Idempotent. Returns a detach function. */
    startWatching(): () => void {
        if (this._watching()) return () => this.stopWatching();
        window.addEventListener('online', this.onlineHandler);
        window.addEventListener('offline', this.offlineHandler);
        this._watching.set(true);
        this.setOnline(navigator.onLine);
        return () => this.stopWatching();
    }

    stopWatching(): void {
        window.removeEventListener('online', this.onlineHandler);
        window.removeEventListener('offline', this.offlineHandler);
        this._watching.set(false);
    }

    setOnline(val: boolean): void {
        if (this._online() === val) return; // prevent spurious lastChangeAt bumps
        this._online.set(val);
        this._lastChangeAt.set(Date.now());
    }
}
