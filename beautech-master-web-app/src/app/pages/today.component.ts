/**
 * Today.
 *
 * The first screen anyone sees, so it answers the questions the owner and the
 * storekeeper actually open the app for: what is running out, what is it all
 * worth, what arrived. Phase 1 has no issues or counts yet — those tiles land
 * with their screens rather than sitting here as decoration.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { apiErrorMessage } from '@/core/api';
import { formatMoney, formatQty } from '@/core/format';
import type { GrnListRow, StockRow } from '@/core/types';

@Component({
    selector: 'app-today',
    standalone: true,
    imports: [CommonModule, RouterLink, ButtonModule],
    template: `
        <div class="space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Good day, {{ firstName() }}</h1>
                    <p class="text-surface-500 text-sm">{{ auth.location()?.name }}</p>
                </div>
                @if (canReceive()) {
                    <button pButton icon="pi pi-truck" label="Receive delivery" routerLink="/grn"></button>
                }
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                    <div class="text-sm text-surface-500">Stock value</div>
                    <div class="text-2xl font-bold">{{ money(totalValue()) }}</div>
                </div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                    <div class="text-sm text-surface-500">Below reorder</div>
                    <div class="text-2xl font-bold" [class.text-red-600]="low().length > 0">{{ low().length }}</div>
                </div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                    <div class="text-sm text-surface-500">Out of stock</div>
                    <div class="text-2xl font-bold" [class.text-red-600]="outOfStock() > 0">{{ outOfStock() }}</div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold">Needs ordering</h2>
                        <a routerLink="/stock" class="text-sm text-primary">See all stock</a>
                    </div>
                    @if (loading()) {
                        <p class="text-surface-500 text-sm">Loading…</p>
                    } @else if (low().length === 0) {
                        <p class="text-surface-500 text-sm">Nothing below its reorder point. Unusual, but good.</p>
                    } @else {
                        <ul class="divide-y divide-surface">
                            @for (row of low().slice(0, 8); track row.itemId + '-' + row.sectionId) {
                                <li class="py-2 flex items-center justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="font-medium truncate">{{ row.name }}</div>
                                        <div class="text-xs text-surface-500 font-mono">{{ row.code }}</div>
                                    </div>
                                    <div class="text-right shrink-0">
                                        <div class="font-medium" [class.text-red-600]="row.qtyBase <= 0">
                                            {{ qty(row) }}
                                        </div>
                                        <div class="text-xs text-surface-500">
                                            reorder at {{ qtyRaw(row.reorderPoint, row.stockUnit) }}
                                        </div>
                                    </div>
                                </li>
                            }
                        </ul>
                    }
                </div>

                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6">
                    <h2 class="font-semibold mb-4">Recent deliveries</h2>
                    @if (loading()) {
                        <p class="text-surface-500 text-sm">Loading…</p>
                    } @else if (recent().length === 0) {
                        <p class="text-surface-500 text-sm">No deliveries recorded yet.</p>
                    } @else {
                        <ul class="divide-y divide-surface">
                            @for (g of recent().slice(0, 8); track g.id) {
                                <li class="py-2 flex items-center justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="font-medium truncate">{{ g.supplierName }}</div>
                                        <div class="text-xs text-surface-500">
                                            {{ g.invoiceNo || 'no invoice' }} · {{ g.lineCount }} line(s)
                                        </div>
                                    </div>
                                    <div class="text-right shrink-0">
                                        <div class="font-medium">{{ money(g.total ?? 0) }}</div>
                                        <div class="text-xs text-surface-500">{{ shortDate(g.receivedAt) }}</div>
                                    </div>
                                </li>
                            }
                        </ul>
                    }
                </div>
            </div>
        </div>
    `
})
export class TodayComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);

    readonly loading = signal(true);
    readonly error = signal<string | null>(null);
    readonly rows = signal<StockRow[]>([]);
    readonly totalValue = signal(0);
    readonly recent = signal<GrnListRow[]>([]);

    readonly low = computed(() => this.rows().filter((r) => r.belowReorder));
    readonly outOfStock = computed(() => this.rows().filter((r) => r.qtyBase <= 0).length);
    readonly firstName = computed(() => this.auth.user()?.name.split(' ')[0] ?? '');
    readonly canReceive = computed(() =>
        ['owner', 'manager', 'storekeeper', 'purchasing'].includes(this.auth.role() ?? '')
    );

    async ngOnInit(): Promise<void> {
        try {
            const [stock, grn] = await Promise.all([this.api.getStock(), this.api.listGrn(10)]);
            this.rows.set(stock.rows);
            this.totalValue.set(stock.totalValue);
            this.recent.set(grn.rows);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    qty(row: StockRow): string {
        return formatQty(row.qtyBase, row.stockUnit);
    }

    qtyRaw(qtyBase: number, unit: string): string {
        return formatQty(qtyBase, unit);
    }

    money(n: number): string {
        return formatMoney(n);
    }

    shortDate(iso: string): string {
        return new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' });
    }
}
