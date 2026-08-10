/** Transactions: unsynced local + settled server (FRONTEND_DOCUMENTATION.md §2.3). */
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { liveQuery, Subscription as DexieSub } from 'dexie';
import { db } from '../core/pos-database';
import { SalesService } from '../services/sales.service';
import { formatMoney } from '../core/money';
import { PaginationComponent } from '../components/pagination.component';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { LocalCustomer, LocalTransaction, ServerTransaction } from '../core/types';

@Component({
    selector: 'pos-transactions',
    standalone: true,
    imports: [CommonModule, FormsModule, PaginationComponent],
    template: `
        <div class="flex flex-col gap-6">
            <!-- Unsynced -->
            <section class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                <h2 class="font-bold mb-3 flex items-center gap-2"><i class="pi pi-cloud-upload text-amber-500"></i> Unsynced ({{ unsynced().length }})</h2>
                <div class="overflow-auto">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-muted-color border-b border-surface">
                            <th class="py-2">ID</th><th>Date</th><th>Method</th><th class="text-right">Total</th><th class="text-center">Status</th></tr></thead>
                        <tbody>
                            <tr *ngFor="let t of unsynced()" class="border-b border-surface/50">
                                <td class="py-2 font-mono text-xs">{{ t.id.slice(0, 8) }}</td>
                                <td>{{ t.created_at | date: 'short' }}</td>
                                <td>{{ t.payment_method }}</td>
                                <td class="text-right">{{ money(t.total) }}</td>
                                <td class="text-center"><span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Pending sync</span></td>
                            </tr>
                            <tr *ngIf="!unsynced().length"><td colspan="5" class="text-center text-muted-color py-4">All transactions synced</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Settled -->
            <section class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                <h2 class="font-bold mb-3 flex items-center gap-2"><i class="pi pi-check-circle text-emerald-500"></i> Settled transactions</h2>
                <div *ngIf="error()" class="text-sm text-rose-600 mb-2">{{ error() }}</div>
                <div class="overflow-auto">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-muted-color border-b border-surface">
                            <th class="py-2">ID</th><th>Date</th><th>Customer</th><th>Method</th><th class="text-right">Total</th><th class="text-right">Actions</th></tr></thead>
                        <tbody>
                            <tr *ngFor="let t of settled()" class="border-b border-surface/50">
                                <td class="py-2 font-mono text-xs">{{ t.id.slice(0, 8) }}</td>
                                <td>{{ t.createdAt | date: 'short' }}</td>
                                <td>{{ t.customerName || '—' }}</td>
                                <td>{{ t.paymentMethod }}</td>
                                <td class="text-right">{{ money(t.total) }}</td>
                                <td class="text-right">
                                    <button type="button" class="text-primary text-xs mr-3" (click)="editCustomer(t)">Edit</button>
                                </td>
                            </tr>
                            <tr *ngIf="!settled().length && !loading()"><td colspan="6" class="text-center text-muted-color py-4">No settled transactions</td></tr>
                        </tbody>
                    </table>
                </div>
                <pos-pagination [page]="page()" [pageSize]="pageSize" [total]="total()" (change)="onPage($event.page)"></pos-pagination>
            </section>
        </div>

        <!-- Edit customer modal -->
        <div *ngIf="editing()" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" (click)="editing.set(null)">
            <div class="rounded-2xl bg-surface-0 dark:bg-surface-900 p-6 w-full max-w-md" (click)="$event.stopPropagation()">
                <h3 class="font-bold mb-3">Attach customer</h3>
                <select [(ngModel)]="selectedCustomerId" class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900">
                    <option value="">No customer</option>
                    <option *ngFor="let c of customers()" [value]="c.id">{{ c.name }}</option>
                </select>
                <div class="flex justify-end gap-2 mt-4">
                    <button type="button" class="px-4 py-2 rounded-lg border border-surface" (click)="editing.set(null)">Cancel</button>
                    <button type="button" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast" (click)="saveCustomer()">Save</button>
                </div>
            </div>
        </div>
    `
})
export class TransactionsComponent implements OnInit, OnDestroy {
    private sales = inject(SalesService);
    private notify = inject(NotifyService);

    unsynced = signal<LocalTransaction[]>([]);
    customers = signal<LocalCustomer[]>([]);
    settled = signal<ServerTransaction[]>([]);
    total = signal(0);
    page = signal(1);
    pageSize = 15;
    loading = signal(false);
    error = signal<string | null>(null);
    editing = signal<ServerTransaction | null>(null);
    selectedCustomerId = '';

    private subs: DexieSub[] = [];

    money = (n: number) => formatMoney(n);

    ngOnInit(): void {
        this.subs.push(
            liveQuery(() => db.local_transactions.where('synced').equals(0).reverse().sortBy('created_at')).subscribe((t) =>
                this.unsynced.set(t)
            )
        );
        this.subs.push(liveQuery(() => db.customers.toArray()).subscribe((c) => this.customers.set(c)));
        this.load();
    }

    ngOnDestroy(): void {
        this.subs.forEach((s) => s.unsubscribe());
    }

    async load(): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const res = await this.sales.listTransactions({ page: this.page(), pageSize: this.pageSize });
            this.settled.set(res.rows ?? []);
            this.total.set(res.total ?? 0);
        } catch (e) {
            this.error.set(apiErrorMessage(e));
        } finally {
            this.loading.set(false);
        }
    }

    onPage(p: number): void {
        this.page.set(p);
        this.load();
    }

    editCustomer(t: ServerTransaction): void {
        this.selectedCustomerId = t.customerId ?? '';
        this.editing.set(t);
    }

    async saveCustomer(): Promise<void> {
        const t = this.editing();
        if (!t) return;
        try {
            await this.sales.updateTransactionCustomer(t.id, this.selectedCustomerId || null);
            this.notify.success('Transaction updated');
            this.editing.set(null);
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
