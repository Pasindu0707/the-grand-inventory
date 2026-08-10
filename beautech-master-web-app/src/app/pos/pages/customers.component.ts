/** Customers master-detail + loyalty (FRONTEND_DOCUMENTATION.md §2.3 Customers). */
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomersService } from '../services/customers.service';
import { formatMoney } from '../core/money';
import { AuthStore } from '../stores/auth.store';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { ApiCustomer, ServerTransaction } from '../core/types';

@Component({
    selector: 'pos-customers',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <!-- List -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 flex flex-col gap-3">
                <input [(ngModel)]="search" placeholder="Search name / email / phone…" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                <form (ngSubmit)="create()" class="rounded-xl bg-surface-50 dark:bg-surface-800 p-3 flex flex-col gap-2">
                    <div class="text-xs uppercase tracking-wider text-muted-color">New customer</div>
                    <input [(ngModel)]="form.fullName" name="fullName" required placeholder="Full name" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                    <input [(ngModel)]="form.email" name="email" type="email" placeholder="Email" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                    <input [(ngModel)]="form.phone" name="phone" placeholder="Phone" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                    <button type="submit" class="py-2 rounded-lg bg-primary text-primary-contrast text-sm" [disabled]="busy()">Add customer</button>
                </form>
                <div class="flex flex-col gap-1 max-h-96 overflow-auto">
                    <button type="button" *ngFor="let c of filtered()" (click)="select(c)"
                        class="text-left px-3 py-2 rounded-lg text-sm hover:bg-surface-100 dark:hover:bg-surface-800"
                        [class.bg-surface-100]="selected()?.id === c.id" [class.dark:bg-surface-800]="selected()?.id === c.id">
                        <div class="font-medium">{{ c.fullName }}</div>
                        <div class="text-xs text-muted-color">{{ c.email || c.phone || '—' }}</div>
                    </button>
                </div>
            </div>

            <!-- Detail -->
            <div class="lg:col-span-2 rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-6">
                <ng-container *ngIf="selected() as c; else empty">
                    <div class="flex items-start justify-between">
                        <div>
                            <h2 class="text-xl font-bold">{{ c.fullName }}</h2>
                            <p class="text-sm text-muted-color">{{ c.email || '—' }} · {{ c.phone || '—' }}</p>
                            <p class="text-xs text-muted-color">Joined {{ c.createdAt | date }}</p>
                        </div>
                        <button type="button" class="text-rose-500 text-sm" (click)="remove(c)">Delete</button>
                    </div>

                    <div class="grid grid-cols-2 gap-3 mt-4">
                        <div class="rounded-xl bg-surface-50 dark:bg-surface-800 p-3">
                            <div class="text-xs text-muted-color">Loyalty points</div>
                            <div class="text-2xl font-bold">{{ points() }}</div>
                        </div>
                        <div class="rounded-xl bg-surface-50 dark:bg-surface-800 p-3">
                            <div class="text-xs text-muted-color">Value</div>
                            <div class="text-2xl font-bold">{{ money(pointValue()) }}</div>
                        </div>
                    </div>

                    <form (ngSubmit)="redeem()" class="flex items-end gap-2 mt-4">
                        <div class="flex flex-col gap-1">
                            <label class="text-xs uppercase tracking-wider text-muted-color">Redeem points</label>
                            <input type="number" [(ngModel)]="redeemAmount" name="redeem" min="0" [max]="points()" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm w-40" />
                        </div>
                        <button type="submit" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast text-sm">Redeem</button>
                    </form>

                    <h3 class="font-semibold mt-6 mb-2">Purchase history</h3>
                    <div class="overflow-auto">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Date</th><th>ID</th><th class="text-right">Total</th></tr></thead>
                            <tbody>
                                <tr *ngFor="let h of history()" class="border-b border-surface/50">
                                    <td class="py-2">{{ h.createdAt | date: 'short' }}</td>
                                    <td class="font-mono text-xs">{{ h.id.slice(0, 8) }}</td>
                                    <td class="text-right">{{ money(h.total) }}</td>
                                </tr>
                                <tr *ngIf="!history().length"><td colspan="3" class="text-center text-muted-color py-4">No purchases yet</td></tr>
                            </tbody>
                        </table>
                    </div>
                </ng-container>
                <ng-template #empty><div class="text-center text-muted-color py-16">Select a customer to view their profile</div></ng-template>
            </div>
        </div>
    `
})
export class CustomersComponent implements OnInit {
    private service = inject(CustomersService);
    private auth = inject(AuthStore);
    private notify = inject(NotifyService);

    customers = signal<ApiCustomer[]>([]);
    selected = signal<ApiCustomer | null>(null);
    history = signal<ServerTransaction[]>([]);
    points = signal(0);
    search = '';
    busy = signal(false);
    redeemAmount = 0;
    form = { fullName: '', email: '', phone: '' };

    money = (n: number) => formatMoney(n);

    filtered = computed(() => {
        const t = this.search.toLowerCase().trim();
        if (!t) return this.customers();
        return this.customers().filter(
            (c) => c.fullName.toLowerCase().includes(t) || (c.email ?? '').toLowerCase().includes(t) || (c.phone ?? '').includes(t)
        );
    });

    pointValue = computed(() => {
        const rate = this.auth.config()?.loyaltyRedeemPointsPerCurrency ?? 1;
        return Number((this.points() / rate).toFixed(2));
    });

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        try {
            this.customers.set(await this.service.listCustomers());
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async select(c: ApiCustomer): Promise<void> {
        this.selected.set(c);
        this.history.set([]);
        this.points.set(0);
        try {
            const [hist, bal] = await Promise.all([this.service.purchaseHistory(c.id), this.service.loyaltyBalance(c.id)]);
            this.history.set(hist ?? []);
            this.points.set(bal?.points ?? 0);
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async create(): Promise<void> {
        if (!this.form.fullName.trim()) return;
        this.busy.set(true);
        try {
            await this.service.createCustomer({ ...this.form });
            this.notify.success('Customer added');
            this.form = { fullName: '', email: '', phone: '' };
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }

    async redeem(): Promise<void> {
        const c = this.selected();
        if (!c || this.redeemAmount <= 0) return;
        try {
            const res = await this.service.redeemPoints(c.id, this.redeemAmount);
            this.points.set(res.points);
            this.redeemAmount = 0;
            this.notify.success('Points redeemed');
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async remove(c: ApiCustomer): Promise<void> {
        if (!(await this.notify.confirm(`Delete ${c.fullName}?`, 'Delete customer'))) return;
        try {
            await this.service.deleteCustomer(c.id);
            this.selected.set(null);
            this.notify.success('Customer deleted');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
