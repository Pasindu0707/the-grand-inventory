/**
 * Counts of things waiting, shown beside menu entries.
 *
 * Only one so far: delivery reports management has not read. It is re-read on
 * every navigation - one cheap query - and straight after a report is marked
 * read, so the number beside the menu never argues with the list under it.
 */
import { Injectable, inject, signal } from '@angular/core';
import { AuthStore } from './auth.store';
import { GrandService } from './grand.service';

@Injectable({ providedIn: 'root' })
export class BadgeStore {
    private auth = inject(AuthStore);
    private api = inject(GrandService);

    readonly deliveryReports = signal(0);

    async refresh(): Promise<void> {
        if (this.auth.role() !== 'management') {
            this.deliveryReports.set(0);
            return;
        }
        try {
            const page = await this.api.listDeliveryReports({ unseen: true, limit: 1 });
            this.deliveryReports.set(page.total);
        } catch {
            /* a missing badge is not worth an error on every screen */
        }
    }
}
