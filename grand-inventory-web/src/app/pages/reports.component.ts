/**
 * Reports.
 *
 * Twelve of them now, which changed the shape of the screen. Five fitted on a
 * row of tabs and all five could be fetched at once on open; twelve cannot.
 * Loading them together would mean a dozen queries - several of them full
 * ledger scans - every time somebody opened the page to read one number.
 *
 * So: a list of names first, and one report at a time. Pick one, it runs, and
 * Back returns to the list. Nothing is fetched until it is asked for, and
 * changing the dates re-runs only what is on screen.
 *
 * The list is in two groups, and the split is the argument the old file made
 * about wastage and shrinkage generalised. The first four ask whether the stock
 * figure is true. The other eight ask whether the operation is working. They
 * are read by the same person at different moments and for different reasons,
 * and mixing them into one alphabetical list of twelve makes both harder to
 * find.
 *
 * Each report still says what it is *not* telling you. A number without its
 * caveat gets acted on wrongly.
 *
 * Above both groups sit two plain lists, read weekly or monthly rather than
 * over any range: what was bought, and what each section asked for and got.
 * They pick a week or a month and step back and forward through them, because
 * that is how anybody here asks for them.
 *
 * Every report prints. Print opens the same report in its own tab at
 * /reports/print - no sidebar, no buttons, black on white, with a heading that
 * says which branch, which period, and who printed it when - the same way the
 * delivery note does.
 */
import { Component, computed, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthStore } from '@/core/auth.store';
import { openPrint } from '@/core/print';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { GrandService } from '@/core/grand.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import type {
    BelowReorderRow,
    ConsumptionRow,
    CountAccuracyRow,
    OpenReturnRow,
    ReturnsSummaryRow,
    DateRange,
    DeadStockRow,
    OpenPoRow,
    PurchaseListReport,
    PurchaseListRow,
    SectionRequestReport,
    SectionRequestRow,
    ServiceLevelRow,
    ShrinkageRow,
    StockOnHandRow,
    StockOutRow,
    SupplierPerformanceRow,
    UsageVarianceRow,
    WastageReport
} from '@/core/types';

type ReportKey =
    | 'purchaseList'
    | 'sectionRequests'
    | 'usage'
    | 'shrinkage'
    | 'wastage'
    | 'stockouts'
    | 'openPos'
    | 'serviceLevel'
    | 'suppliers'
    | 'stockOnHand'
    | 'deadStock'
    | 'consumption'
    | 'countAccuracy'
    | 'returns';

interface ReportCard {
    key: ReportKey;
    title: string;
    /** One line, on the card. What question it answers, not how. */
    blurb: string;
    icon: string;
}

/** Read by the week or the month, not over any range. */
const LIST_REPORTS: ReportCard[] = [
    {
        key: 'purchaseList',
        title: 'What we bought',
        blurb: 'Everything received from suppliers in the week or month, supplier by supplier.',
        icon: 'pi-shopping-cart'
    },
    {
        key: 'sectionRequests',
        title: 'What each section asked for',
        blurb: 'What Restaurant, the kitchens and Cleaning asked the store for, and what they got.',
        icon: 'pi-arrow-right-arrow-left'
    }
];

const PERIODIC: ReportKey[] = ['purchaseList', 'sectionRequests'];

/**
 * The catalogue.
 *
 * Order within each group is deliberate: the ones most likely to be opened on
 * an ordinary Monday come first, not the ones that were built first.
 */
const STOCK_REPORTS: ReportCard[] = [
    {
        key: 'stockouts',
        title: 'Stock-outs and reorder',
        blurb: 'What ran out, and what is about to.',
        icon: 'pi-exclamation-circle'
    },
    {
        key: 'shrinkage',
        title: 'Unexplained loss',
        blurb: 'Count gaps with no wastage document behind them.',
        icon: 'pi-eye-slash'
    },
    {
        key: 'wastage',
        title: 'Declared waste',
        blurb: 'What was thrown away, and the reason given.',
        icon: 'pi-trash'
    },
    {
        key: 'usage',
        title: 'Usage variance',
        blurb: 'What the recipes say should have been used, against what was.',
        icon: 'pi-chart-line'
    }
];

const OPS_REPORTS: ReportCard[] = [
    {
        key: 'openPos',
        title: 'Orders still out',
        blurb: 'Purchases raised and not yet delivered, oldest first.',
        icon: 'pi-clock'
    },
    {
        key: 'serviceLevel',
        title: 'Request service level',
        blurb: 'How often the store filled each section in full, and how fast.',
        icon: 'pi-send'
    },
    {
        key: 'suppliers',
        title: 'Supplier performance',
        blurb: 'Who delivers what they promised, and how much of it comes back.',
        icon: 'pi-truck'
    },
    {
        key: 'stockOnHand',
        title: 'Stock on hand',
        blurb: 'What was on every shelf, as at a date.',
        icon: 'pi-box'
    },
    {
        key: 'deadStock',
        title: 'Dead and slow stock',
        blurb: 'Stock sitting on a shelf that nobody has touched.',
        icon: 'pi-inbox'
    },
    {
        key: 'consumption',
        title: 'Consumption by section',
        blurb: 'What each section got through.',
        icon: 'pi-chart-bar'
    },
    {
        key: 'returns',
        title: 'Returns and credits',
        blurb: 'What went back, why, and whether the supplier answered for it.',
        icon: 'pi-undo'
    },
    {
        key: 'countAccuracy',
        title: 'Count accuracy',
        blurb: 'Whose stock counts can be trusted.',
        icon: 'pi-check-square'
    }
];

@Component({
    selector: 'app-reports',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, TagModule],
    styles: [
        `
            .glance {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
                gap: 0.75rem;
            }
            .glance__tile {
                border: 1px solid var(--p-content-border-color);
                border-radius: 0.9rem;
                padding: 0.85rem 1rem;
                background: var(--p-content-background);
            }
            .glance__tile--wide {
                min-width: 12rem;
            }
            .glance__tile--warn {
                border-color: #fdba74;
            }
            .glance__n {
                font-size: 1.75rem;
                font-weight: 700;
                line-height: 1.15;
            }
            .glance__l {
                font-size: 0.8rem;
                color: var(--p-text-muted-color);
            }
            .glance__flags {
                display: flex;
                flex-direction: column;
                gap: 0.1rem;
                margin-top: 0.4rem;
                font-size: 0.8rem;
                font-weight: 600;
            }

            /* ── Printed sheet ─────────────────────────────────────────── */
            :host(.is-print) {
                display: block;
                min-height: 100vh;
                background: #e5e5e5;
                color: #111;
            }
            :host(.is-print) .report-wrap {
                max-width: 210mm;
                margin: 0 auto 2rem;
                padding: 12mm 14mm;
                background: #fff;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
                font-size: 10.5pt;
            }
            .print-toolbar {
                display: flex;
                gap: 0.5rem;
                justify-content: center;
                padding: 1rem;
                margin: -12mm -14mm 0;
                background: #e5e5e5;
            }
            .print-toolbar button {
                padding: 0.6rem 1.2rem;
                border-radius: 0.5rem;
                border: 1px solid #999;
                background: #fff;
                color: #111;
                font-weight: 600;
                cursor: pointer;
            }
            .print-toolbar button.primary {
                background: #111;
                color: #fff;
                border-color: #111;
            }
            .print-head {
                display: flex;
                justify-content: space-between;
                gap: 1.5rem;
                padding-bottom: 0.8rem;
                border-bottom: 2px solid #111;
            }
            .print-head h1 {
                font-size: 18pt;
                font-weight: 700;
                margin: 0.15rem 0;
            }
            .print-head p {
                color: #444;
                margin: 0;
            }
            .print-kicker {
                font-size: 8.5pt;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: #555;
            }
            .print-meta {
                text-align: right;
                font-size: 9.5pt;
                white-space: nowrap;
            }
            .print-meta span {
                display: inline-block;
                min-width: 4.5rem;
                color: #666;
            }
            :host(.is-print) .overflow-x-auto,
            :host(.is-print) .overflow-hidden {
                overflow: visible !important;
            }
            :host(.is-print) table th,
            :host(.is-print) table td {
                color: #111;
            }
            :host(.is-print) .report-card,
            :host(.is-print) .glance__tile,
            :host(.is-print) .rounded-2xl {
                background: #fff !important;
                border-color: #bbb !important;
            }
            :host(.is-print) tr {
                break-inside: avoid;
            }
            :host(.is-print) thead {
                display: table-header-group;
            }
            :host(.is-print) h2 {
                break-after: avoid;
            }

            @media print {
                :host(.is-print) {
                    background: #fff;
                }
                :host(.is-print) .report-wrap {
                    max-width: none;
                    margin: 0;
                    padding: 0;
                    box-shadow: none;
                }
                .print-toolbar {
                    display: none;
                }
            }
        `
    ],
    host: { '[class.is-print]': 'printMode' },
    template: `
        <div class="space-y-6 report-wrap">
            <!-- ── The list ─────────────────────────────────────────────── -->
            @if (!selected()) {
                <div>
                    <h1 class="text-2xl font-bold">Reports</h1>
                    <p class="text-surface-500 text-sm">
                        Pick one. Each runs on its own dates.
                    </p>
                </div>

                <div class="space-y-3">
                    <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500">
                        Weekly and monthly lists
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        @for (card of listReports; track card.key) {
                            <button
                                type="button"
                                class="text-left rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-5 hover:border-primary transition-colors"
                                (click)="open(card.key)">
                                <div class="flex items-start gap-3">
                                    <i class="pi {{ card.icon }} text-xl text-primary mt-0.5"></i>
                                    <div class="min-w-0">
                                        <div class="font-semibold">{{ card.title }}</div>
                                        <p class="text-sm text-surface-500 mt-1">{{ card.blurb }}</p>
                                    </div>
                                </div>
                            </button>
                        }
                    </div>
                </div>

                <div class="space-y-3">
                    <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500">
                        Is the stock figure true?
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        @for (card of stockReports; track card.key) {
                            <button
                                type="button"
                                class="text-left rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-5 hover:border-primary transition-colors"
                                (click)="open(card.key)">
                                <div class="flex items-start gap-3">
                                    <i class="pi {{ card.icon }} text-xl text-primary mt-0.5"></i>
                                    <div class="min-w-0">
                                        <div class="font-semibold">{{ card.title }}</div>
                                        <p class="text-sm text-surface-500 mt-1">{{ card.blurb }}</p>
                                    </div>
                                </div>
                            </button>
                        }
                    </div>
                </div>

                <div class="space-y-3">
                    <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500">
                        Is the operation working?
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        @for (card of opsReports; track card.key) {
                            <button
                                type="button"
                                class="text-left rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-5 hover:border-primary transition-colors"
                                (click)="open(card.key)">
                                <div class="flex items-start gap-3">
                                    <i class="pi {{ card.icon }} text-xl text-primary mt-0.5"></i>
                                    <div class="min-w-0">
                                        <div class="font-semibold">{{ card.title }}</div>
                                        <p class="text-sm text-surface-500 mt-1">{{ card.blurb }}</p>
                                    </div>
                                </div>
                            </button>
                        }
                    </div>
                </div>
            }

            <!-- ── One report ───────────────────────────────────────────── -->
            @if (card(); as c) {
                <div class="space-y-6">
                    @if (printMode) {
                        <!-- The printed sheet's own heading: what, where, when, who. -->
                        <div class="print-toolbar">
                            <button type="button" (click)="closeTab()">Close tab</button>
                            <button type="button" class="primary" [disabled]="loading()" (click)="printNow()">
                                Print
                            </button>
                        </div>
                        <header class="print-head">
                            <div>
                                <div class="print-kicker">The Grand · {{ branchName() }}</div>
                                <h1>{{ c.title }}</h1>
                                <p>{{ c.blurb }}</p>
                            </div>
                            <div class="print-meta">
                                <div><span>Period</span> {{ periodLabel() }}</div>
                                <div><span>Printed</span> {{ printedAt }}</div>
                                <div><span>By</span> {{ printedBy() }}</div>
                            </div>
                        </header>
                    } @else {
                    <button
                        pButton
                        text
                        size="small"
                        icon="pi pi-arrow-left"
                        label="All reports"
                        (click)="back()"></button>

                    <div class="flex flex-wrap items-end justify-between gap-3">
                        <div class="min-w-0">
                            <h1 class="text-2xl font-bold">{{ c.title }}</h1>
                            <p class="text-surface-500 text-sm">{{ c.blurb }}</p>
                        </div>
                        @if (isPeriodic()) {
                            <!-- A week or a month, and arrows to step through them. -->
                            <div class="flex flex-wrap items-center gap-2">
                                <div class="inline-flex rounded-lg border border-surface overflow-hidden" role="radiogroup" aria-label="Period">
                                    @for (k of periodKinds; track k.value) {
                                        <button
                                            type="button"
                                            role="radio"
                                            class="px-3 py-2 text-sm font-medium"
                                            [attr.aria-checked]="period() === k.value"
                                            [class.bg-primary]="period() === k.value"
                                            [class.text-primary-contrast]="period() === k.value"
                                            (click)="setPeriod(k.value)">
                                            {{ k.label }}
                                        </button>
                                    }
                                </div>
                                <button pButton outlined size="small" icon="pi pi-chevron-left" aria-label="Earlier" (click)="shift(-1)"></button>
                                <span class="min-w-48 text-center font-semibold">{{ periodLabel() }}</span>
                                <button pButton outlined size="small" icon="pi pi-chevron-right" aria-label="Later" (click)="shift(1)"></button>
                                <button pButton icon="pi pi-print" label="Print" [disabled]="loading()" (click)="print()"></button>
                            </div>
                        } @else {
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
                            <button
                                pButton
                                icon="pi pi-refresh"
                                label="Run"
                                [loading]="loading()"
                                (click)="load()"></button>
                            <button
                                pButton
                                outlined
                                icon="pi pi-print"
                                label="Print"
                                [disabled]="loading()"
                                (click)="print()"></button>
                        </div>
                        }
                    </div>
                    }

                    @if (error()) {
                        <div class="app-note app-note--error">{{ error() }}</div>
                    }

                    <!-- What we bought -->
                    @if (selected() === 'purchaseList') {
                        @if (purchases(); as pl) {
                            <div class="glance">
                                <div class="glance__tile">
                                    <div class="glance__n">{{ pl.summary.deliveries }}</div>
                                    <div class="glance__l">deliveries</div>
                                </div>
                                <div class="glance__tile">
                                    <div class="glance__n">{{ pl.summary.suppliers }}</div>
                                    <div class="glance__l">suppliers</div>
                                </div>
                                <div class="glance__tile">
                                    <div class="glance__n">{{ pl.summary.lines }}</div>
                                    <div class="glance__l">different things bought</div>
                                </div>
                                <div class="glance__tile" [class.glance__tile--warn]="pl.summary.deliveriesWithReturns > 0">
                                    <div class="glance__n">{{ pl.summary.deliveriesWithReturns }}</div>
                                    <div class="glance__l">deliveries with goods sent back</div>
                                </div>
                                <div class="glance__tile">
                                    <div class="glance__n">{{ pl.summary.ordersRaised }}</div>
                                    <div class="glance__l">orders raised</div>
                                </div>
                            </div>

                            @if (purchaseGroups().length === 0) {
                                <p class="p-8 text-center text-surface-500 rounded-2xl border border-surface">
                                    {{ loading() ? 'Loading…' : 'Nothing was received in this ' + period() + '.' }}
                                </p>
                            }
                            @for (g of purchaseGroups(); track g.supplierId) {
                                <section class="report-card rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                    <div class="px-5 py-3 border-b border-surface flex flex-wrap items-baseline justify-between gap-2">
                                        <h2 class="font-semibold text-lg">{{ g.supplierName }}</h2>
                                        <span class="text-sm text-surface-500">
                                            {{ g.rows.length }} item{{ g.rows.length === 1 ? '' : 's' }}
                                            @if (g.sentBack > 0) {
                                                · <span class="text-orange-600">{{ g.sentBack }} with goods sent back</span>
                                            }
                                        </span>
                                    </div>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead class="text-left border-b border-surface text-surface-500">
                                                <tr>
                                                    <th class="px-5 py-2 font-medium">Item</th>
                                                    <th class="px-4 py-2 font-medium text-right">Received</th>
                                                    <th class="px-4 py-2 font-medium text-right">In total</th>
                                                    <th class="px-4 py-2 font-medium text-right">Sent back</th>
                                                    <th class="px-5 py-2 font-medium text-right">Deliveries</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @for (r of g.rows; track $index) {
                                                    <tr class="border-b border-surface last:border-b-0">
                                                        <td class="px-5 py-2">
                                                            <span class="font-medium">{{ r.name }}</span>
                                                            @if (r.itemId === null) {
                                                                <span class="text-xs text-surface-500"> · not stock</span>
                                                            }
                                                        </td>
                                                        <td class="px-4 py-2 text-right whitespace-nowrap">
                                                            {{ r.qtyPacks > 0 ? received(r) : 'None kept' }}
                                                        </td>
                                                        <td class="px-4 py-2 text-right whitespace-nowrap font-semibold">
                                                            {{ r.qtyPacks > 0 && r.itemId !== null ? q(r.qtyBase, r.unit ?? '') : '' }}
                                                        </td>
                                                        <td class="px-4 py-2 text-right whitespace-nowrap" [class.text-orange-600]="r.qtyPacksSentBack > 0">
                                                            {{ r.qtyPacksSentBack > 0 ? sentBack(r) : '-' }}
                                                        </td>
                                                        <td class="px-5 py-2 text-right">{{ r.deliveries }}</td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            }
                            <p class="text-xs text-surface-500">
                                What arrived and was kept, by supplier, in the pack it came in. Sent back means
                                refused at the door and taken away by the driver - never in stock. Deliveries
                                counts the separate drops each item came on.
                            </p>
                        } @else {
                            <p class="p-8 text-center text-surface-500">Loading…</p>
                        }
                    }

                    <!-- What each section asked for -->
                    @if (selected() === 'sectionRequests') {
                        @if (requestsReport(); as rr) {
                            @if (rr.sections.length === 0) {
                                <p class="p-8 text-center text-surface-500 rounded-2xl border border-surface">
                                    {{ loading() ? 'Loading…' : 'No section asked the store for anything in this ' + period() + '.' }}
                                </p>
                            } @else {
                                <div class="glance">
                                    @for (sec of rr.sections; track sec.sectionId) {
                                        <div class="glance__tile glance__tile--wide" [class.glance__tile--warn]="sec.itemsShort > 0 || sec.waiting > 0">
                                            <div class="font-semibold">{{ sec.sectionName }}</div>
                                            <div class="glance__n">{{ sec.requests }}</div>
                                            <div class="glance__l">request{{ sec.requests === 1 ? '' : 's' }} · {{ sec.items }} items</div>
                                            <div class="glance__flags">
                                                @if (sec.itemsShort > 0) {
                                                    <span class="text-orange-600">{{ sec.itemsShort }} given short</span>
                                                }
                                                @if (sec.waiting > 0) {
                                                    <span class="text-yellow-700 dark:text-yellow-400">{{ sec.waiting }} still waiting</span>
                                                }
                                                @if (sec.notConfirmed > 0) {
                                                    <span class="text-surface-500">{{ sec.notConfirmed }} not yet confirmed</span>
                                                }
                                                @if (sec.itemsShort === 0 && sec.waiting === 0 && sec.notConfirmed === 0) {
                                                    <span class="text-green-700 dark:text-green-400">All given in full</span>
                                                }
                                            </div>
                                        </div>
                                    }
                                </div>

                                @for (g of requestGroups(); track g.sectionId) {
                                    <section class="report-card rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                        <div class="px-5 py-3 border-b border-surface">
                                            <h2 class="font-semibold text-lg">{{ g.sectionName }}</h2>
                                        </div>
                                        <div class="overflow-x-auto">
                                            <table class="w-full text-sm">
                                                <thead class="text-left border-b border-surface text-surface-500">
                                                    <tr>
                                                        <th class="px-5 py-2 font-medium">Item</th>
                                                        <th class="px-4 py-2 font-medium text-right">Asked for</th>
                                                        <th class="px-4 py-2 font-medium text-right">Store sent</th>
                                                        <th class="px-4 py-2 font-medium text-right">Section confirmed</th>
                                                        <th class="px-5 py-2 font-medium">Note</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    @for (r of g.rows; track r.itemId) {
                                                        <tr class="border-b border-surface last:border-b-0">
                                                            <td class="px-5 py-2">
                                                                <span class="font-medium">{{ r.name }}</span>
                                                                @if (r.requests > 1) {
                                                                    <span class="text-xs text-surface-500"> · on {{ r.requests }} requests</span>
                                                                }
                                                            </td>
                                                            <td class="px-4 py-2 text-right whitespace-nowrap">{{ q(r.qtyAsked, r.stockUnit) }}</td>
                                                            <td class="px-4 py-2 text-right whitespace-nowrap font-semibold">{{ q(r.qtySent, r.stockUnit) }}</td>
                                                            <td class="px-4 py-2 text-right whitespace-nowrap">{{ q(r.qtyConfirmed, r.stockUnit) }}</td>
                                                            <td class="px-5 py-2">
                                                                @if (r.qtyShort > 0) {
                                                                    <span class="text-orange-600">{{ q(r.qtyShort, r.stockUnit) }} short</span>
                                                                }
                                                                @if (r.qtyWaiting > 0) {
                                                                    <span class="text-yellow-700 dark:text-yellow-400">
                                                                        {{ r.qtyShort > 0 ? ' · ' : '' }}{{ q(r.qtyWaiting, r.stockUnit) }} waiting
                                                                    </span>
                                                                }
                                                                @if (r.qtySent > r.qtyConfirmed) {
                                                                    <span class="text-surface-500">
                                                                        {{ r.qtyShort > 0 || r.qtyWaiting > 0 ? ' · ' : '' }}{{ q(r.qtySent - r.qtyConfirmed, r.stockUnit) }} not confirmed
                                                                    </span>
                                                                }
                                                                @if (r.qtyShort === 0 && r.qtyWaiting === 0 && r.qtySent <= r.qtyConfirmed) {
                                                                    <span class="text-green-700 dark:text-green-400">In full</span>
                                                                }
                                                            </td>
                                                        </tr>
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                }
                                <p class="text-xs text-surface-500">
                                    Asked for is what the section requested. Store sent is what the store handed
                                    over. Section confirmed is what the section said arrived. Short means the store
                                    sent less than was asked; waiting means the store has not answered yet;
                                    not confirmed means it was sent but nobody in the section has confirmed it.
                                    Cancelled requests are left out.
                                </p>
                            }
                        } @else {
                            <p class="p-8 text-center text-surface-500">Loading…</p>
                        }
                    }

                    <!-- A. Usage variance -->
                    @if (selected() === 'usage') {
                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <div class="px-5 py-4 border-b border-surface">
                                <div class="font-semibold">Theoretical vs actual usage</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    What the recipes say should have been used, against what actually left
                                    the store. Driven by declared production, so it is strongest for bakery
                                    and prepped items and weakest for à-la-carte, where nobody logs every
                                    plate.
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
                                                <th class="px-4 py-2 font-semibold text-right">Difference</th>
                                                <th class="px-4 py-2 font-semibold text-right">Variance</th>
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
                                                    <td class="px-4 py-2 text-right">{{ q(row.varianceQty, row.stockUnit) }}</td>
                                                    <td
                                                        class="px-4 py-2 text-right font-medium"
                                                        [class.text-red-600]="row.varianceQty > 0">
                                                        {{ row.variancePct > 0 ? '+' : '' }}{{ row.variancePct }}%
                                                    </td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    }

                    <!-- B. Shrinkage -->
                    @if (selected() === 'shrinkage') {
                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <div class="px-5 py-4 border-b border-surface">
                                <div class="font-semibold">Unexplained loss</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    Count gaps with <strong>no wastage document</strong> behind them. Anything
                                    that was declared as waste is not here - it is under Declared waste, where
                                    it belongs. Gaps under a small share of the shelf are filtered out:
                                    counting is never exact, and a report that lists every rounding error
                                    stops being read.
                                </p>
                            </div>
                            @if (shrink().length === 0) {
                                <p class="p-8 text-center text-surface-500">
                                    {{ loading() ? 'Loading…' : 'Nothing unexplained in this period.' }}
                                </p>
                            } @else {
                                <div class="px-5 py-4 border-b border-surface">
                                    <span class="text-sm text-surface-500">Unexplained gaps</span>
                                    <div class="text-2xl font-bold text-red-600">{{ shrink().length }}</div>
                                </div>
                                <ul class="divide-y divide-surface">
                                    @for (row of shrink(); track row.itemId + row.businessDate + row.sectionCode) {
                                        <li class="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
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
                                                <div class="text-red-600 font-semibold">{{ q(row.varianceQty, row.stockUnit) }}</div>
                                            </div>
                                        </li>
                                    }
                                </ul>
                            }
                        </div>
                    }

                    <!-- D. Wastage -->
                    @if (selected() === 'wastage') {
                        <div class="space-y-4">
                            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                                <div class="font-semibold">Declared waste</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    Waste someone logged, with a reason. This is a kitchen and ordering
                                    problem, not a loss-prevention one - a spoilage spike usually means
                                    over-ordering or a chiller fault. It is deliberately kept separate from
                                    unexplained loss.
                                </p>
                            </div>

                            @if (wastage(); as w) {
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    @for (r of w.byReason; track r.reasonCode) {
                                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                                            <div class="text-sm text-surface-500">{{ r.reasonLabel }}</div>
                                            <div class="text-xl font-bold">{{ r.events }}</div>
                                            <div class="text-xs text-surface-500">event(s)</div>
                                        </div>
                                    }
                                </div>

                                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                    <ul class="divide-y divide-surface">
                                        @for (row of w.rows; track row.itemId + row.reasonCode + row.sectionCode) {
                                            <li class="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
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

                    <!-- E. Stock-outs -->
                    @if (selected() === 'stockouts') {
                        <div class="space-y-4">
                            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                <div class="px-5 py-4 border-b border-surface font-semibold">Needs ordering now</div>
                                @if (low().length === 0) {
                                    <p class="p-8 text-center text-surface-500">Nothing below its reorder point.</p>
                                } @else {
                                    <ul class="divide-y divide-surface">
                                        @for (row of low(); track row.itemId) {
                                            <li class="px-5 py-4 flex items-center justify-between gap-3">
                                                <div>
                                                    <div class="font-medium">
                                                        {{ row.name }}
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
                                <div class="px-5 py-4 border-b border-surface">
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
                                            <li class="px-5 py-4 flex items-center justify-between gap-3">
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

                    <!-- F. Orders still out -->
                    @if (selected() === 'openPos') {
                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <div class="px-5 py-4 border-b border-surface">
                                <div class="font-semibold">Purchases not yet delivered</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    Raised in this period and still open. <strong>Days open</strong> is the
                                    column that matters: an order waiting on approval for a fortnight is not
                                    a purchasing problem, it is a nobody-was-told problem. Dated by when the
                                    order was raised, not by when it is due.
                                </p>
                            </div>
                            @if (openPos().length === 0) {
                                <p class="p-8 text-center text-surface-500">
                                    {{ loading() ? 'Loading…' : 'Nothing outstanding.' }}
                                </p>
                            } @else {
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead class="text-left border-b border-surface">
                                            <tr>
                                                <th class="px-4 py-2 font-semibold">Supplier</th>
                                                <th class="px-4 py-2 font-semibold">Raised by</th>
                                                <th class="px-4 py-2 font-semibold">Stage</th>
                                                <th class="px-4 py-2 font-semibold text-right">Days open</th>
                                                <th class="px-4 py-2 font-semibold text-right">Overdue</th>
                                                <th class="px-4 py-2 font-semibold text-right">Still to come</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (row of openPos(); track row.id) {
                                                <tr class="border-b border-surface">
                                                    <td class="px-4 py-2">
                                                        <div class="font-medium">{{ row.supplierName || 'Not chosen yet' }}</div>
                                                        <div class="text-xs text-surface-500">
                                                            {{ row.lineCount }} line(s)
                                                            @if (row.neededBy) {
                                                                · needed by {{ row.neededBy }}
                                                            }
                                                        </div>
                                                    </td>
                                                    <td class="px-4 py-2">{{ row.raisedBy }}</td>
                                                    <td class="px-4 py-2">
                                                        <p-tag [severity]="poTone(row.status)" [value]="poLabel(row.status)"></p-tag>
                                                    </td>
                                                    <td
                                                        class="px-4 py-2 text-right font-medium"
                                                        [class.text-red-600]="row.daysOpen >= 14">
                                                        {{ row.daysOpen }}
                                                    </td>
                                                    <td class="px-4 py-2 text-right" [class.text-red-600]="row.daysLate > 0">
                                                        {{ row.daysLate > 0 ? row.daysLate + ' d' : '-' }}
                                                    </td>
                                                    <td class="px-4 py-2 text-right">{{ row.linesOutstanding }} line(s)</td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    }

                    <!-- G. Service level -->
                    @if (selected() === 'serviceLevel') {
                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <div class="px-5 py-4 border-b border-surface">
                                <div class="font-semibold">How well the store served each section</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    Two fill rates, because they settle different arguments.
                                    <strong>Lines in full</strong> is what the kitchen feels - half the things
                                    they asked for came up short. <strong>Quantity filled</strong> is what the
                                    store defends itself with - they got 94% of what they asked for. Both are
                                    true at once. Cancelled requests are left out.
                                </p>
                            </div>
                            @if (serviceLevel().length === 0) {
                                <p class="p-8 text-center text-surface-500">
                                    {{ loading() ? 'Loading…' : 'Nobody asked for anything in this period.' }}
                                </p>
                            } @else {
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead class="text-left border-b border-surface">
                                            <tr>
                                                <th class="px-4 py-2 font-semibold">Section</th>
                                                <th class="px-4 py-2 font-semibold text-right">Requests</th>
                                                <th class="px-4 py-2 font-semibold text-right">Still waiting</th>
                                                <th class="px-4 py-2 font-semibold text-right">Lines in full</th>
                                                <th class="px-4 py-2 font-semibold text-right">Quantity filled</th>
                                                <th class="px-4 py-2 font-semibold text-right">Avg wait</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (row of serviceLevel(); track row.sectionId) {
                                                <tr class="border-b border-surface">
                                                    <td class="px-4 py-2 font-medium">{{ row.sectionName }}</td>
                                                    <td class="px-4 py-2 text-right">{{ row.requests }}</td>
                                                    <td class="px-4 py-2 text-right" [class.text-red-600]="row.stillWaiting > 0">
                                                        {{ row.stillWaiting }}
                                                    </td>
                                                    <td class="px-4 py-2 text-right font-medium" [class.text-red-600]="poor(row.fillRatePct)">
                                                        {{ pct(row.fillRatePct) }}
                                                        <span class="text-xs text-surface-500">
                                                            ({{ row.linesInFull }}/{{ row.lines }})
                                                        </span>
                                                    </td>
                                                    <td class="px-4 py-2 text-right" [class.text-red-600]="poor(row.qtyFillPct)">
                                                        {{ pct(row.qtyFillPct) }}
                                                    </td>
                                                    <td class="px-4 py-2 text-right">{{ hours(row.avgHoursToRelease) }}</td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    }

                    <!-- H. Suppliers -->
                    @if (selected() === 'suppliers') {
                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <div class="px-5 py-4 border-b border-surface">
                                <div class="font-semibold">Who is worth ordering from</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    Returns is how many claims were raised against them; credit notes is how
                                    many they have since settled with one. A supplier who agrees to everything
                                    and credits nothing shows as a wide gap between the two. The percentage
                                    under returns is the share of delivered lines that had something sent back.
                                    Fill rate comes from the orders, deliveries from the goods received, and they
                                    are counted separately on purpose - a delivery can arrive with no order
                                    behind it, and an order can be placed and never filled. A supplier appears
                                    if they were ordered from <em>or</em> delivered in this period.
                                </p>
                            </div>
                            @if (suppliers().length === 0) {
                                <p class="p-8 text-center text-surface-500">
                                    {{ loading() ? 'Loading…' : 'No supplier activity in this period.' }}
                                </p>
                            } @else {
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead class="text-left border-b border-surface">
                                            <tr>
                                                <th class="px-4 py-2 font-semibold">Supplier</th>
                                                <th class="px-4 py-2 font-semibold text-right">Orders</th>
                                                <th class="px-4 py-2 font-semibold text-right">Deliveries</th>
                                                <th class="px-4 py-2 font-semibold text-right">Fill rate</th>
                                                <th class="px-4 py-2 font-semibold text-right">Late</th>
                                                <th class="px-4 py-2 font-semibold text-right">Avg days</th>
                                                <th class="px-4 py-2 font-semibold text-right">Returns</th>
                                                <th class="px-4 py-2 font-semibold text-right">Credit notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (row of suppliers(); track row.supplierId) {
                                                <tr class="border-b border-surface">
                                                    <td class="px-4 py-2 font-medium">{{ row.supplierName }}</td>
                                                    <td class="px-4 py-2 text-right">{{ row.orders }}</td>
                                                    <td class="px-4 py-2 text-right">{{ row.deliveries }}</td>
                                                    <td class="px-4 py-2 text-right font-medium" [class.text-red-600]="poor(row.fillRatePct)">
                                                        {{ pct(row.fillRatePct) }}
                                                    </td>
                                                    <td class="px-4 py-2 text-right" [class.text-red-600]="row.lateOrders > 0">
                                                        {{ row.lateOrders }}
                                                    </td>
                                                    <td class="px-4 py-2 text-right">
                                                        {{ row.avgDaysToClose === null ? '-' : row.avgDaysToClose }}
                                                    </td>
                                                    <td class="px-4 py-2 text-right" [class.text-amber-600]="(row.returnRatePct ?? 0) > 2">
                                                        {{ row.returns }}
                                                        @if (row.returnRatePct !== null) {
                                                            <span class="text-xs text-surface-500 block">{{ row.returnRatePct }}%</span>
                                                        }
                                                    </td>
                                                    <td class="px-4 py-2 text-right">{{ row.credited }}</td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    }

                    <!-- I. Stock on hand -->
                    @if (selected() === 'stockOnHand') {
                        <div class="space-y-4">
                            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-5">
                                <div class="text-sm text-surface-500">On hand at {{ range().to }}</div>
                                <div class="text-3xl font-bold">{{ stockOnHand().length }} line(s)</div>
                                <p class="text-sm text-surface-500 mt-2">
                                    Rebuilt from the ledger up to the end date, so it answers "what was on
                                    the shelf on the 31st" after the fact.
                                </p>
                            </div>

                            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                @if (stockOnHand().length === 0) {
                                    <p class="p-8 text-center text-surface-500">
                                        {{ loading() ? 'Loading…' : 'Nothing on hand.' }}
                                    </p>
                                } @else {
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead class="text-left border-b border-surface">
                                                <tr>
                                                    <th class="px-4 py-2 font-semibold">Section</th>
                                                    <th class="px-4 py-2 font-semibold">Item</th>
                                                    <th class="px-4 py-2 font-semibold text-right">On hand</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @for (row of stockOnHand(); track row.sectionId + '-' + row.itemId) {
                                                    <tr class="border-b border-surface">
                                                        <td class="px-4 py-2">{{ row.sectionName }}</td>
                                                        <td class="px-4 py-2">
                                                            <div class="font-medium">{{ row.name }}</div>
                                                            <div class="text-xs text-surface-500 font-mono">{{ row.code }}</div>
                                                        </td>
                                                        <td class="px-4 py-2 text-right font-medium">{{ q(row.qtyBase, row.stockUnit) }}</td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                }
                            </div>
                        </div>
                    }

                    <!-- J. Dead stock -->
                    @if (selected() === 'deadStock') {
                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <div class="px-5 py-4 border-b border-surface">
                                <div class="font-semibold">Nothing issued from it in this period</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    Shelf space tied up, and for anything perishable spoilage that has not been
                                    logged yet. <strong>Last moved</strong> is what separates slow from
                                    forgotten. A short date range will flag things that are simply seasonal -
                                    widen it before you act on a row.
                                </p>
                            </div>
                            @if (deadStock().length === 0) {
                                <p class="p-8 text-center text-surface-500">
                                    {{ loading() ? 'Loading…' : 'Everything on the shelves moved.' }}
                                </p>
                            } @else {
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead class="text-left border-b border-surface">
                                            <tr>
                                                <th class="px-4 py-2 font-semibold">Item</th>
                                                <th class="px-4 py-2 font-semibold">Section</th>
                                                <th class="px-4 py-2 font-semibold text-right">On hand</th>
                                                <th class="px-4 py-2 font-semibold text-right">Last moved</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (row of deadStock(); track row.itemId + '-' + row.sectionName) {
                                                <tr class="border-b border-surface">
                                                    <td class="px-4 py-2">
                                                        <div class="font-medium">{{ row.name }}</div>
                                                        <div class="text-xs text-surface-500 font-mono">{{ row.code }}</div>
                                                    </td>
                                                    <td class="px-4 py-2">{{ row.sectionName }}</td>
                                                    <td class="px-4 py-2 text-right font-medium">{{ q(row.qtyBase, row.stockUnit) }}</td>
                                                    <td class="px-4 py-2 text-right">
                                                        @if (row.lastMovedOn) {
                                                            <div>{{ row.lastMovedOn }}</div>
                                                            <div
                                                                class="text-xs"
                                                                [class.text-red-600]="(row.daysSinceMoved ?? 0) >= 30"
                                                                [class.text-surface-500]="(row.daysSinceMoved ?? 0) < 30">
                                                                {{ row.daysSinceMoved }} days ago
                                                            </div>
                                                        } @else {
                                                            <span class="text-surface-500">never</span>
                                                        }
                                                    </td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    }

                    <!-- K. Consumption -->
                    @if (selected() === 'consumption') {
                        <div class="space-y-4">
                            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-5">
                                <div class="text-sm text-surface-500">Drawn from the store</div>
                                <div class="text-3xl font-bold">{{ consumption().length }} line(s)</div>
                                <p class="text-sm text-surface-500 mt-2">
                                    What each section was issued, less anything it handed straight back. Stock
                                    that went back was never used, and a report that counted it would flag a
                                    kitchen for food it never had.
                                </p>
                            </div>

                            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                @if (consumption().length === 0) {
                                    <p class="p-8 text-center text-surface-500">
                                        {{ loading() ? 'Loading…' : 'Nothing was issued in this period.' }}
                                    </p>
                                } @else {
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead class="text-left border-b border-surface">
                                                <tr>
                                                    <th class="px-4 py-2 font-semibold">Section</th>
                                                    <th class="px-4 py-2 font-semibold">Item</th>
                                                    <th class="px-4 py-2 font-semibold text-right">Quantity</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @for (row of consumption(); track row.sectionId + '-' + row.itemId) {
                                                    <tr class="border-b border-surface">
                                                        <td class="px-4 py-2">{{ row.sectionName }}</td>
                                                        <td class="px-4 py-2">
                                                            <div class="font-medium">{{ row.name }}</div>
                                                            <div class="text-xs text-surface-500 font-mono">{{ row.code }}</div>
                                                        </td>
                                                        <td class="px-4 py-2 text-right font-medium">{{ q(row.qtyBase, row.stockUnit) }}</td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                }
                            </div>
                        </div>
                    }

                    <!-- L. Count accuracy -->
                    @if (selected() === 'countAccuracy') {
                        <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                            <div class="px-5 py-4 border-b border-surface">
                                <div class="font-semibold">Whose counts can be trusted</div>
                                <p class="text-sm text-surface-500 mt-1">
                                    Every other report rests on the stock figure being true, and the count is
                                    where that gets checked. Read it both ways: someone who is off on a third
                                    of their lines makes shrinkage unreadable, and someone who is
                                    <em>never</em> off is either very good or not really counting. Lines left
                                    uncounted are excluded - a half-finished count is not an inaccuracy.
                                </p>
                            </div>
                            @if (countAccuracy().length === 0) {
                                <p class="p-8 text-center text-surface-500">
                                    {{ loading() ? 'Loading…' : 'No counts were closed in this period.' }}
                                </p>
                            } @else {
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead class="text-left border-b border-surface">
                                            <tr>
                                                <th class="px-4 py-2 font-semibold">Counted by</th>
                                                <th class="px-4 py-2 font-semibold">Section</th>
                                                <th class="px-4 py-2 font-semibold text-right">Counts</th>
                                                <th class="px-4 py-2 font-semibold text-right">Lines</th>
                                                <th class="px-4 py-2 font-semibold text-right">Off</th>
                                                <th class="px-4 py-2 font-semibold text-right">Accuracy</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (row of countAccuracy(); track row.countedBy + '-' + row.sectionName) {
                                                <tr class="border-b border-surface">
                                                    <td class="px-4 py-2 font-medium">{{ row.countedBy }}</td>
                                                    <td class="px-4 py-2">{{ row.sectionName }}</td>
                                                    <td class="px-4 py-2 text-right">{{ row.counts }}</td>
                                                    <td class="px-4 py-2 text-right">{{ row.lines }}</td>
                                                    <td class="px-4 py-2 text-right">{{ row.linesOff }}</td>
                                                    <td class="px-4 py-2 text-right font-medium" [class.text-red-600]="poor(row.accuracyPct)">
                                                        {{ pct(row.accuracyPct) }}
                                                    </td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </div>
                    }

                    <!-- M. Returns -->
                    @if (selected() === 'returns') {
                        <div class="space-y-4">
                            <div
                                class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-5">
                                <div class="text-sm text-surface-500">
                                    Supplier returns still to chase
                                </div>
                                <div class="text-3xl font-bold">
                                    {{ openReturns().length }}
                                </div>
                                <p class="text-sm text-surface-500 mt-2">
                                    Raised, approved or gone, and the supplier has not yet answered
                                    with a credit note, a replacement or a refusal.
                                </p>
                            </div>

                            <div
                                class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                <div class="px-5 py-4 border-b border-surface">
                                    <div class="font-semibold">Why stock is coming back</div>
                                    <p class="text-sm text-surface-500 mt-1">
                                        Grouped by reason, because the first question is which of
                                        these is the supplier problem and which is ours. Damage
                                        against one vendor is a delivery problem; expiry across all
                                        of them is an ordering problem, and no amount of arguing
                                        with suppliers fixes it.
                                    </p>
                                </div>
                                @if (returns().length === 0) {
                                    <p class="p-8 text-center text-surface-500">
                                        {{ loading() ? 'Loading…' : 'Nothing came back in this period.' }}
                                    </p>
                                } @else {
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead class="text-left border-b border-surface">
                                                <tr>
                                                    <th class="px-4 py-2 font-semibold">Reason</th>
                                                    <th class="px-4 py-2 font-semibold text-right">
                                                        From sections
                                                    </th>
                                                    <th class="px-4 py-2 font-semibold text-right">
                                                        To suppliers
                                                    </th>
                                                    <th class="px-4 py-2 font-semibold text-right">
                                                        Credit notes
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @for (row of returns(); track row.reasonCode) {
                                                    <tr class="border-b border-surface">
                                                        <td class="px-4 py-2 font-medium">
                                                            {{ row.reasonLabel }}
                                                        </td>
                                                        <td class="px-4 py-2 text-right">
                                                            {{ row.sectionReturns }}
                                                        </td>
                                                        <td class="px-4 py-2 text-right">
                                                            {{ row.supplierReturns }}
                                                        </td>
                                                        <td class="px-4 py-2 text-right">
                                                            {{ row.credited }}
                                                        </td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                }
                            </div>

                            <div
                                class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                                <div class="px-5 py-4 border-b border-surface">
                                    <div class="font-semibold">Still to chase</div>
                                    <p class="text-sm text-surface-500 mt-1">
                                        Raised, approved or gone, and not settled. A return nobody
                                        follows up is goods that went back and never came back as
                                        anything.
                                    </p>
                                </div>
                                @if (openReturns().length === 0) {
                                    <p class="p-8 text-center text-surface-500">
                                        {{ loading() ? 'Loading…' : 'Nothing outstanding.' }}
                                    </p>
                                } @else {
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead class="text-left border-b border-surface">
                                                <tr>
                                                    <th class="px-4 py-2 font-semibold">Supplier</th>
                                                    <th class="px-4 py-2 font-semibold">Invoice</th>
                                                    <th class="px-4 py-2 font-semibold">Reason</th>
                                                    <th class="px-4 py-2 font-semibold">Where it is</th>
                                                    <th class="px-4 py-2 font-semibold text-right">
                                                        Waiting
                                                    </th>
                                                    <th class="px-4 py-2 font-semibold text-right">
                                                        Lines
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @for (row of openReturns(); track row.id) {
                                                    <tr class="border-b border-surface">
                                                        <td class="px-4 py-2">{{ row.supplierName }}</td>
                                                        <td class="px-4 py-2 font-mono text-xs">
                                                            {{ row.invoiceNo || '-' }}
                                                        </td>
                                                        <td class="px-4 py-2">{{ row.reasonLabel }}</td>
                                                        <td class="px-4 py-2">{{ row.status }}</td>
                                                        <td
                                                            class="px-4 py-2 text-right"
                                                            [class.text-red-600]="row.daysWaiting > 30">
                                                            {{ row.daysWaiting }} days
                                                        </td>
                                                        <td class="px-4 py-2 text-right font-medium">
                                                            {{ row.lines }}
                                                        </td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                }
                            </div>
                        </div>
                    }
                </div>
            }
        </div>
    `
})
export class ReportsComponent implements OnInit, OnDestroy {
    private api = inject(GrandService);
    private auth = inject(AuthStore);
    private route = inject(ActivatedRoute);

    readonly listReports = LIST_REPORTS;
    readonly stockReports = STOCK_REPORTS;
    readonly opsReports = OPS_REPORTS;

    /** True on /reports/print: the same report, as a sheet of paper. */
    readonly printMode = this.route.snapshot.data['print'] === true;
    readonly printedAt = new Date().toLocaleString('en-LK', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    /** The theme the tab had, put back if this component is ever left in place. */
    private wasDark = false;

    readonly periodKinds = [
        { value: 'week' as const, label: 'Week' },
        { value: 'month' as const, label: 'Month' }
    ];
    readonly period = signal<'week' | 'month'>('week');

    /** Null is the list. Everything else is one report. */
    readonly selected = signal<ReportKey | null>(null);
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    readonly card = computed(() => {
        const key = this.selected();
        if (!key) return null;
        return [...LIST_REPORTS, ...STOCK_REPORTS, ...OPS_REPORTS].find((c) => c.key === key) ?? null;
    });

    readonly isPeriodic = computed(() => {
        const key = this.selected();
        return key !== null && PERIODIC.includes(key);
    });

    // The two lists
    readonly purchases = signal<PurchaseListReport | null>(null);
    readonly requestsReport = signal<SectionRequestReport | null>(null);

    /** One block per supplier, biggest list first. */
    readonly purchaseGroups = computed(() => {
        const rows = this.purchases()?.rows ?? [];
        const groups = new Map<number, { supplierId: number; supplierName: string; rows: PurchaseListRow[]; sentBack: number }>();
        for (const r of rows) {
            const g = groups.get(r.supplierId) ?? {
                supplierId: r.supplierId,
                supplierName: r.supplierName,
                rows: [],
                sentBack: 0
            };
            g.rows.push(r);
            if (r.qtyPacksSentBack > 0) g.sentBack++;
            groups.set(r.supplierId, g);
        }
        return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
    });

    /** One block per section, in the order of the tiles above. */
    readonly requestGroups = computed(() => {
        const report = this.requestsReport();
        if (!report) return [];
        return report.sections.map((sec) => ({
            sectionId: sec.sectionId,
            sectionName: sec.sectionName,
            rows: report.rows.filter((r) => r.sectionId === sec.sectionId) as SectionRequestRow[]
        })).filter((g) => g.rows.length > 0);
    });

    // The four
    readonly usage = signal<UsageVarianceRow[]>([]);
    readonly shrink = signal<ShrinkageRow[]>([]);
    readonly wastage = signal<WastageReport | null>(null);
    readonly outs = signal<StockOutRow[]>([]);
    readonly low = signal<BelowReorderRow[]>([]);

    // The eight
    readonly openPos = signal<OpenPoRow[]>([]);
    readonly serviceLevel = signal<ServiceLevelRow[]>([]);
    readonly suppliers = signal<SupplierPerformanceRow[]>([]);
    readonly stockOnHand = signal<StockOnHandRow[]>([]);
    readonly deadStock = signal<DeadStockRow[]>([]);
    readonly consumption = signal<ConsumptionRow[]>([]);
    readonly countAccuracy = signal<CountAccuracyRow[]>([]);
    readonly returns = signal<ReturnsSummaryRow[]>([]);
    readonly openReturns = signal<OpenReturnRow[]>([]);

    /**
     * Defaults to the last 60 days so the seeded demo period is visible without
     * anyone having to know the dates. Kept across reports on purpose: someone
     * looking at August wants August in the next one too.
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

    ngOnInit(): void {
        if (!this.printMode) return;
        // Paper is white whatever the screen theme is.
        this.wasDark = document.documentElement.classList.contains('app-dark');
        document.documentElement.classList.remove('app-dark');

        const q = this.route.snapshot.queryParamMap;
        const key = q.get('key') as ReportKey | null;
        const from = q.get('from');
        const to = q.get('to');
        const period = q.get('period');
        if (period === 'week' || period === 'month') this.period.set(period);
        if (from && to) this.range.set({ from, to });
        if (!key) return;
        this.selected.set(key);
        void this.load().then(() => {
            // After the sheet has painted, or the dialog prints a blank page.
            if (q.get('print') === '1' && !this.error()) setTimeout(() => window.print(), 400);
        });
    }

    ngOnDestroy(): void {
        if (this.printMode && this.wasDark) document.documentElement.classList.add('app-dark');
    }

    /** Open one report and run it. Nothing else is fetched. */
    open(key: ReportKey): void {
        this.selected.set(key);
        this.error.set(null);
        // The lists are read a week or a month at a time; land on this one.
        if (PERIODIC.includes(key)) this.setPeriod(this.period(), false);
        void this.load();
    }

    // ── Weeks and months ────────────────────────────────────────────────────

    /** Snap the range to the week or month holding its end date (or today). */
    setPeriod(kind: 'week' | 'month', run = true): void {
        this.period.set(kind);
        this.range.set(periodAround(kind, parseDay(this.range().to)));
        if (run) void this.load();
    }

    /** One week or month earlier (-1) or later (+1). */
    shift(step: number): void {
        const start = parseDay(this.range().from);
        if (this.period() === 'week') start.setDate(start.getDate() + 7 * step);
        else start.setMonth(start.getMonth() + step, 1);
        this.range.set(periodAround(this.period(), start));
        void this.load();
    }

    /** "Week of 28 Sep - 4 Oct 2026", "October 2026", or the plain range. */
    readonly periodLabel = computed(() => {
        const { from, to } = this.range();
        const a = parseDay(from);
        const b = parseDay(to);
        if (this.isPeriodic() && this.period() === 'month') {
            return a.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        }
        const left = a.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const right = b.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        return this.isPeriodic() ? `${left} - ${right}` : `${a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} - ${b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    });

    // ── Printing ────────────────────────────────────────────────────────────

    print(): void {
        const key = this.selected();
        if (!key) return;
        openPrint('/reports/print', { key, ...this.range(), period: this.period() });
    }

    printNow(): void {
        window.print();
    }

    closeTab(): void {
        window.close();
    }

    branchName(): string {
        return this.auth.location()?.name ?? '';
    }

    printedBy(): string {
        return this.auth.user()?.name ?? '';
    }

    received(r: PurchaseListRow): string {
        return r.packName ? `${trimNum(r.qtyPacks)} × ${r.packName}` : `${trimNum(r.qtyPacks)} ${r.unit || 'each'}`;
    }

    sentBack(r: PurchaseListRow): string {
        return r.packName
            ? `${trimNum(r.qtyPacksSentBack)} × ${r.packName}`
            : `${trimNum(r.qtyPacksSentBack)} ${r.unit || 'each'}`;
    }

    back(): void {
        this.selected.set(null);
        this.error.set(null);
    }

    /**
     * Runs whatever is on screen, and only that.
     *
     * The old version fetched all five on open. At twelve - several of them
     * full ledger scans - that would be a dozen queries to read one number.
     */
    async load(): Promise<void> {
        const key = this.selected();
        if (!key) return;

        this.loading.set(true);
        this.error.set(null);
        const range = this.range();

        try {
            switch (key) {
                case 'purchaseList':
                    this.purchases.set(await this.api.purchaseListReport(range));
                    break;
                case 'sectionRequests':
                    this.requestsReport.set(await this.api.sectionRequestsReport(range));
                    break;
                case 'usage':
                    this.usage.set((await this.api.usageVariance(range)).rows);
                    break;
                case 'shrinkage': {
                    const res = await this.api.shrinkage(range);
                    this.shrink.set(res.rows);
                    break;
                }
                case 'wastage':
                    this.wastage.set(await this.api.wastageReport(range));
                    break;
                case 'stockouts': {
                    const res = await this.api.stockOutReport(range);
                    this.outs.set(res.stockOuts);
                    this.low.set(res.belowReorder);
                    break;
                }
                case 'openPos':
                    this.openPos.set((await this.api.openPurchaseOrdersReport(range)).rows);
                    break;
                case 'serviceLevel':
                    this.serviceLevel.set((await this.api.serviceLevelReport(range)).rows);
                    break;
                case 'suppliers':
                    this.suppliers.set((await this.api.supplierPerformanceReport(range)).rows);
                    break;
                case 'stockOnHand':
                    this.stockOnHand.set((await this.api.stockOnHandReport(range)).rows);
                    break;
                case 'deadStock':
                    this.deadStock.set((await this.api.deadStockReport(range)).rows);
                    break;
                case 'consumption':
                    this.consumption.set((await this.api.consumptionReport(range)).rows);
                    break;
                case 'countAccuracy':
                    this.countAccuracy.set((await this.api.countAccuracyReport(range)).rows);
                    break;
                case 'returns': {
                    // Two questions on one screen: why it is coming back, and
                    // what is still waiting on a supplier.
                    const [summary, open] = await Promise.all([
                        this.api.returnsReport(range),
                        this.api.openReturnsReport(range)
                    ]);
                    this.returns.set(summary.rows);
                    this.openReturns.set(open.rows);
                    break;
                }
            }
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    q(qty: number, unit: string): string {
        return formatQty(qty, unit);
    }

    /** Null means there was nothing to divide by, which is not zero percent. */
    pct(n: number | null): string {
        return n === null ? '-' : `${n}%`;
    }

    /** Below 90% is worth looking at. Null is not bad, it is unknown. */
    poor(n: number | null): boolean {
        return n !== null && n < 90;
    }

    /** Hours read badly past a day or so, and days read badly under one. */
    hours(n: number | null): string {
        if (n === null) return '-';
        return n < 24 ? `${n} h` : `${Math.round((n / 24) * 10) / 10} d`;
    }

    poLabel(status: string): string {
        return (
            { requested: 'Waiting for approval', approved: 'Approved', ordered: 'On order' }[
                status
            ] ?? status
        );
    }

    poTone(status: string): 'success' | 'warn' | 'info' | 'secondary' {
        return status === 'approved' ? 'success' : status === 'ordered' ? 'info' : 'warn';
    }
}

function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Local calendar date as YYYY-MM-DD, without the UTC shift toISOString makes. */
function localDay(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDay(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** The Monday-to-Sunday week, or the calendar month, that holds a date. */
function periodAround(kind: 'week' | 'month', day: Date): DateRange {
    if (kind === 'month') {
        const first = new Date(day.getFullYear(), day.getMonth(), 1);
        const last = new Date(day.getFullYear(), day.getMonth() + 1, 0);
        return { from: localDay(first), to: localDay(last) };
    }
    const monday = new Date(day);
    monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: localDay(monday), to: localDay(sunday) };
}

function trimNum(n: number): string {
    return n.toLocaleString('en-LK', { maximumFractionDigits: 2 });
}
