/**
 * Purchases.
 *
 * Everything the store could not cover ends up here, and only management can
 * decide it — buying is the one action that spends money.
 *
 * Each line shows what the store actually had at the time, so a decision can be
 * made without going and looking.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import type { MyContext, PoDecision, PurchaseOrder } from '@/core/types';

@Component({
    selector: 'app-purchases',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule],
    template: `
        <div class="space-y-6 max-w-4xl">
            <div>
                <h1 class="text-2xl font-bold">Purchases</h1>
                <p class="text-surface-500 text-sm">
                    {{ canDecide() ? 'Things the store could not cover' : 'What you asked to be bought' }}
                </p>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <div class="flex flex-wrap gap-2">
                <button pButton size="small" [outlined]="filter() !== 'requested'" label="Waiting" (click)="setFilter('requested')"></button>
                <button pButton size="small" [outlined]="filter() !== 'approved'" label="Approved" (click)="setFilter('approved')"></button>
                <button pButton size="small" [outlined]="filter() !== ''" label="All" (click)="setFilter('')"></button>
            </div>

            @if (visible().length === 0) {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-10 text-center text-surface-500">
                    {{ loading() ? 'Loading…' : 'Nothing to buy.' }}
                </div>
            } @else {
                @for (po of visible(); track po.id) {
                    <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                        <div class="p-4 border-b border-surface flex flex-wrap items-center justify-between gap-3">
                            <div class="min-w-0">
                                <div class="font-semibold">
                                    Asked by {{ po.raisedBy }}
                                    @if (po.neededBy) {
                                        <span class="text-surface-500 font-normal">
                                            · needed by {{ po.neededBy }}
                                        </span>
                                    }
                                </div>
                                @if (po.reason) {
                                    <div class="text-sm text-surface-500 italic">“{{ po.reason }}”</div>
                                }
                            </div>
                            <p-tag [severity]="tone(po.status)" [value]="label(po.status)"></p-tag>
                        </div>

                        <ul class="divide-y divide-surface">
                            @for (line of po.lines; track line.itemId) {
                                <li class="px-4 py-3 flex items-center justify-between gap-3">
                                    <div class="font-medium">{{ line.name }}</div>
                                    <div class="text-right text-sm">
                                        <div class="font-semibold">{{ q(line.qtyBase, line.stockUnit) }}</div>
                                        <div class="text-surface-500">
                                            store had {{ q(line.qtyInStore, line.stockUnit) }}
                                        </div>
                                    </div>
                                </li>
                            }
                        </ul>

                        @if (po.decidedBy) {
                            <div class="px-4 py-3 bg-surface-50 dark:bg-surface-800 text-sm text-surface-600 dark:text-surface-300">
                                {{ label(po.status) }} by {{ po.decidedBy }}
                                @if (po.decisionNote) {
                                    — “{{ po.decisionNote }}”
                                }
                            </div>
                        }

                        @if (canDecide() && po.status === 'requested') {
                            <div class="p-4 flex flex-wrap justify-end gap-2 border-t border-surface">
                                <button
                                    pButton
                                    outlined
                                    severity="danger"
                                    label="Not now"
                                    [disabled]="busy()"
                                    (click)="decide(po, 'rejected')"></button>
                                <button
                                    pButton
                                    label="Approve"
                                    icon="pi pi-check"
                                    [disabled]="busy()"
                                    (click)="decide(po, 'approved')"></button>
                            </div>
                        } @else if (canDecide() && po.status === 'approved') {
                            <div class="p-4 flex justify-end border-t border-surface">
                                <button
                                    pButton
                                    outlined
                                    label="Mark as bought"
                                    [disabled]="busy()"
                                    (click)="decide(po, 'done')"></button>
                            </div>
                        }
                    </div>
                }
            }
        </div>
    `
})
export class PurchasesComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly orders = signal<PurchaseOrder[]>([]);
    readonly ctx = signal<MyContext | null>(null);
    readonly loading = signal(true);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);
    readonly filter = signal<string>('requested');

    readonly canDecide = computed(() => this.ctx()?.canDecidePurchases ?? false);

    readonly visible = computed(() => {
        const f = this.filter();
        return f ? this.orders().filter((o) => o.status === f) : this.orders();
    });

    async ngOnInit(): Promise<void> {
        try {
            this.ctx.set(await this.api.myContext());
        } catch {
            /* the list still renders */
        }
        await this.load();
        if (this.visible().length === 0 && this.orders().length > 0) this.filter.set('');
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            this.orders.set(await this.api.listPurchaseOrders());
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    setFilter(f: string): void {
        this.filter.set(f);
    }

    async decide(po: PurchaseOrder, decision: PoDecision): Promise<void> {
        this.busy.set(true);
        try {
            await this.api.decidePurchaseOrder(po.id, decision);
            this.notify.success(decision === 'rejected' ? 'Marked as not now' : `Marked ${decision}`);
            await this.load();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    label(status: string): string {
        return (
            {
                requested: 'Waiting',
                approved: 'Approved',
                rejected: 'Not now',
                ordered: 'Ordered',
                done: 'Bought'
            }[status] ?? status
        );
    }

    tone(status: string): 'success' | 'warn' | 'info' | 'danger' | 'secondary' {
        return status === 'approved' || status === 'done'
            ? 'success'
            : status === 'rejected'
              ? 'danger'
              : status === 'ordered'
                ? 'info'
                : 'warn';
    }

    q(qty: number, unit: string): string {
        return formatQty(qty, unit);
    }
}
