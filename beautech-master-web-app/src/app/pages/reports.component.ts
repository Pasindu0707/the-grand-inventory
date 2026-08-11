/**
 * The five reports.
 *
 * The layout carries one argument: spoilage and shrinkage are different things
 * and never share a screen. Declared waste is a kitchen problem with a name on
 * it. Unexplained loss is a different conversation entirely, and mixing them is
 * how a variance report ends up accusing a chef of stealing lettuce — after
 * which nobody opens it again.
 *
 * Each report also says what it is *not* telling you. A number without its
 * caveat gets acted on wrongly.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { GrandService } from '@/core/grand.service';
import { apiErrorMessage } from '@/core/api';
import { formatMoney, formatQty } from '@/core/format';
import type {
    BelowReorderRow,
    DateRange,
    PriceMovementRow,
    ShrinkageRow,
    StockOutRow,
    UsageVarianceRow,
    WastageReport
} from '@/core/types';

type Tab = 'usage' | 'shrinkage' | 'prices' | 'wastage' | 'stockouts';

@Component({
    selector: 'app-reports',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, TagModule],
    template: `
        <div class="space-y-6">
            <div class="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Reports</h1>
                    <p class="text-surface-500 text-sm">{{ range().from }} to {{ range().to }}</p>
                </div>
                <div class="flex items-end gap-2">
                    <div>
                        <label class="block text-xs text-surface-500 mb-1">From</label>
                        <input
                            type="date"
                            class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="range().from"
                            (ngModelChange)="setFrom($event)" />
                    </div>
                    <div>
                        <label class="block text-xs text-surface-500 mb-1">To</label>
                        <input
                            type="date"
                            class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="range().to"
                            (ngModelChange)="setTo($event)" />
                    </div>
                    <button pButton icon="pi pi-refresh" label="Run" (click)="load()" [loading]="loading()"></button>
                </div>
            </div>

            <div class="flex flex-wrap gap-2">
                <button pButton size="small" [outlined]="tab() !== 'usage'" label="Usage variance" (click)="tab.set('usage')"></button>
                <button pButton size="small" [outlined]="tab() !== 'shrinkage'" label="Shrinkage" (click)="tab.set('shrinkage')"></button>
                <button pButton size="small" [outlined]="tab() !== 'wastage'" label="Wastage" (click)="tab.set('wastage')"></button>
                <button pButton size="small" [outlined]="tab() !== 'prices'" label="Price movement" (click)="tab.set('prices')"></button>
                <button pButton size="small" [outlined]="tab() !== 'stockouts'" label="Stock-outs" (click)="tab.set('stockouts')"></button>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <!-- A. Usage variance -->
            @if (tab() === 'usage') {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                    <div class="p-4 border-b border-surface">
                        <div class="font-semibold">Theoretical vs actual usage</div>
                        <p class="text-sm text-surface-500 mt-1">
                            What the recipes say should have been used, against what actually left the
                            store. Driven by declared production, so it is strongest for bakery and
                            prepped items and weakest for à-la-carte, where nobody logs every plate.
                        </p>
                    </div>
                    @if (usage().length === 0) {
                        <p class="p-8 text-center text-surface-500">
                            {{ loading() ? 'Loading…' : 'Nothing outside tolerance.' }}
                        </p>
                    } @else {
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead class="text-left border-b border-surface">
                                    <tr>
                                        <th class="px-4 py-2 font-semibold">Item</th>
                                        <th class="px-4 py-2 font-semibold">Section</th>
                                        <th class="px-4 py-2 font-semibold text-right">Should have used</th>
                                        <th class="px-4 py-2 font-semibold text-right">Actually issued</th>
                                        <th class="px-4 py-2 font-semibold text-right">Variance</th>
                                        <th class="px-4 py-2 font-semibold text-right">Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (row of usage(); track row.itemId + row.sectionCode) {
                                        <tr class="border-b border-surface">
                                            <td class="px-4 py-2">
                                                <div class="font-medium">{{ row.name }}</div>
                                                <div class="text-xs text-surface-500 font-mono">{{ row.code }}</div>
                                            </td>
                                            <td class="px-4 py-2">{{ row.sectionCode }}</td>
                                            <td class="px-4 py-2 text-right">{{ q(row.theoreticalQty, row.stockUnit) }}</td>
                                            <td class="px-4 py-2 text-right">{{ q(row.actualQty, row.stockUnit) }}</td>
                                            <td class="px-4 py-2 text-right font-medium" [class.text-red-600]="row.varianceQty > 0">
                                                {{ row.variancePct > 0 ? '+' : '' }}{{ row.variancePct }}%
                                            </td>
                                            <td class="px-4 py-2 text-right">{{ money(row.varianceValue) }}</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                </div>
            }

            <!-- B. Shrinkage -->
            @if (tab() === 'shrinkage') {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                    <div class="p-4 border-b border-surface">
                        <div class="font-semibold">Unexplained loss</div>
                        <p class="text-sm text-surface-500 mt-1">
                            Count gaps with <strong>no wastage document</strong> behind them. Anything
                            that was declared as waste is not here — it is under Wastage, where it
                            belongs. Small gaps are filtered out: counting is never exact, and a
                            report that lists every rounding error stops being read.
                        </p>
                    </div>
                    @if (shrink().length === 0) {
                        <p class="p-8 text-center text-surface-500">
                            {{ loading() ? 'Loading…' : 'Nothing unexplained in this period.' }}
                        </p>
                    } @else {
                        <div class="p-4 border-b border-surface">
                            <span class="text-sm text-surface-500">Total unexplained</span>
                            <div class="text-2xl font-bold text-red-600">{{ money(shrinkTotal()) }}</div>
                        </div>
                        <ul class="divide-y divide-surface">
                            @for (row of shrink(); track row.itemId + row.businessDate + row.sectionCode) {
                                <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div class="font-medium">{{ row.name }}</div>
                                        <div class="text-xs text-surface-500">
                                            {{ row.sectionCode }} · {{ row.businessDate }}
                                            @if (row.variancePct !== null) {
                                                · {{ row.variancePct }}% of what was expected
                                            }
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="font-medium">{{ q(row.varianceQty, row.stockUnit) }}</div>
                                        <div class="text-red-600 font-semibold">{{ money(row.varianceValue) }}</div>
                                    </div>
                                </li>
                            }
                        </ul>
                    }
                </div>
            }

            <!-- D. Wastage -->
            @if (tab() === 'wastage') {
                <div class="space-y-4">
                    <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                        <div class="font-semibold">Declared waste</div>
                        <p class="text-sm text-surface-500 mt-1">
                            Waste someone logged, with a reason. This is a kitchen and ordering
                            problem, not a loss-prevention one — a spoilage spike usually means
                            over-ordering or a chiller fault. It is deliberately kept separate from
                            unexplained loss.
                        </p>
                    </div>

                    @if (wastage(); as w) {
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            @for (r of w.byReason; track r.reasonCode) {
                                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                                    <div class="text-sm text-surface-500">{{ r.reasonLabel }}</div>
                                    <div class="text-xl font-bold">{{ money(r.value) }}</div>
                                    <div class="text-xs text-surface-500">{{ r.events }} event(s)</div>
                                </div>
                            }
                        </div>

                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <ul class="divide-y divide-surface">
                                @for (row of w.rows; track row.itemId + row.reasonCode + row.sectionCode) {
                                    <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div class="font-medium">{{ row.name }}</div>
                                            <div class="text-xs text-surface-500">
                                                {{ row.sectionCode }} · {{ row.events }} event(s)
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <p-tag severity="info" [value]="row.reasonLabel"></p-tag>
                                            <div class="text-right">
                                                <div class="font-medium">{{ q(row.qtyBase, row.stockUnit) }}</div>
                                                <div class="text-sm text-surface-500">{{ money(row.value) }}</div>
                                            </div>
                                        </div>
                                    </li>
                                }
                            </ul>
                            @if (w.rows.length === 0) {
                                <p class="p-8 text-center text-surface-500">No waste logged.</p>
                            }
                        </div>
                    }
                </div>
            }

            <!-- C. Price movement -->
            @if (tab() === 'prices') {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                    <div class="p-4 border-b border-surface">
                        <div class="font-semibold">Supplier price movement</div>
                        <p class="text-sm text-surface-500 mt-1">
                            Dated by the delivery that revealed the change, not the day the supplier
                            decided it. You find out when the lorry arrives.
                        </p>
                    </div>
                    @if (prices().length === 0) {
                        <p class="p-8 text-center text-surface-500">
                            {{ loading() ? 'Loading…' : 'No significant price changes.' }}
                        </p>
                    } @else {
                        <ul class="divide-y divide-surface">
                            @for (row of prices(); track row.itemPackId + row.effectiveFrom) {
                                <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div class="font-medium">{{ row.itemName }}</div>
                                        <div class="text-xs text-surface-500">
                                            {{ row.packName }} · {{ row.supplierName }} · {{ row.effectiveFrom }}
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-sm text-surface-500">
                                            {{ money(row.previousPrice) }} → {{ money(row.newPrice) }}
                                        </div>
                                        <div
                                            class="font-semibold"
                                            [class.text-red-600]="row.changePct > 0"
                                            [class.text-green-600]="row.changePct < 0">
                                            {{ row.changePct > 0 ? '+' : '' }}{{ row.changePct }}%
                                        </div>
                                    </div>
                                </li>
                            }
                        </ul>
                    }
                </div>
            }

            <!-- E. Stock-outs -->
            @if (tab() === 'stockouts') {
                <div class="space-y-4">
                    <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                        <div class="p-4 border-b border-surface font-semibold">Needs ordering now</div>
                        @if (low().length === 0) {
                            <p class="p-8 text-center text-surface-500">Nothing below its reorder point.</p>
                        } @else {
                            <ul class="divide-y divide-surface">
                                @for (row of low(); track row.itemId) {
                                    <li class="p-4 flex items-center justify-between gap-3">
                                        <div>
                                            <div class="font-medium">
                                                {{ row.name }}
                                                @if (row.isCritical) {
                                                    <p-tag severity="info" value="critical" styleClass="ml-2"></p-tag>
                                                }
                                            </div>
                                            <div class="text-xs text-surface-500 font-mono">{{ row.code }}</div>
                                        </div>
                                        <div class="text-right">
                                            <div class="font-medium" [class.text-red-600]="row.qtyBase <= 0">
                                                {{ q(row.qtyBase, row.stockUnit) }}
                                            </div>
                                            <div class="text-xs text-surface-500">
                                                order {{ q(row.shortfall, row.stockUnit) }} to reach par
                                            </div>
                                        </div>
                                    </li>
                                }
                            </ul>
                        }
                    </div>

                    <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                        <div class="p-4 border-b border-surface">
                            <div class="font-semibold">Ran out during this period</div>
                            <p class="text-sm text-surface-500 mt-1">
                                Days the store held nothing. Each one is a dish that came off the menu
                                mid-service.
                            </p>
                        </div>
                        @if (outs().length === 0) {
                            <p class="p-8 text-center text-surface-500">
                                {{ loading() ? 'Loading…' : 'Nothing ran out.' }}
                            </p>
                        } @else {
                            <ul class="divide-y divide-surface">
                                @for (row of outs(); track row.itemId + row.businessDate) {
                                    <li class="p-4 flex items-center justify-between gap-3">
                                        <div>
                                            <div class="font-medium">{{ row.name }}</div>
                                            <div class="text-xs text-surface-500 font-mono">{{ row.code }}</div>
                                        </div>
                                        <div class="text-right text-sm">
                                            <div class="text-red-600 font-medium">{{ row.businessDate }}</div>
                                            <div class="text-surface-500">{{ q(row.balance, row.stockUnit) }}</div>
                                        </div>
                                    </li>
                                }
                            </ul>
                        }
                    </div>
                </div>
            }
        </div>
    `
})
export class ReportsComponent implements OnInit {
    private api = inject(GrandService);

    readonly tab = signal<Tab>('usage');
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    readonly usage = signal<UsageVarianceRow[]>([]);
    readonly shrink = signal<ShrinkageRow[]>([]);
    readonly shrinkTotal = signal(0);
    readonly prices = signal<PriceMovementRow[]>([]);
    readonly wastage = signal<WastageReport | null>(null);
    readonly outs = signal<StockOutRow[]>([]);
    readonly low = signal<BelowReorderRow[]>([]);

    /**
     * Defaults to the last 60 days so the seeded demo period is visible without
     * anyone having to know the dates.
     */
    readonly range = signal<DateRange>({
        from: iso(new Date(Date.now() - 59 * 86_400_000)),
        to: iso(new Date())
    });

    setFrom(from: string): void {
        this.range.update((r) => ({ ...r, from }));
    }

    setTo(to: string): void {
        this.range.update((r) => ({ ...r, to }));
    }

    async ngOnInit(): Promise<void> {
        await this.load();
    }

    async load(): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const range = this.range();
            const [usage, shrink, prices, wastage, stock] = await Promise.all([
                this.api.usageVariance(range),
                this.api.shrinkage(range),
                this.api.priceMovement(range),
                this.api.wastageReport(range),
                this.api.stockOutReport(range)
            ]);

            this.usage.set(usage.rows);
            this.shrink.set(shrink.rows);
            this.shrinkTotal.set(shrink.totalValue);
            this.prices.set(prices.rows);
            this.wastage.set(wastage);
            this.outs.set(stock.stockOuts);
            this.low.set(stock.belowReorder);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    money(n: number): string {
        return formatMoney(n);
    }

    q(qty: number, unit: string): string {
        return formatQty(qty, unit);
    }
}

function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
}
