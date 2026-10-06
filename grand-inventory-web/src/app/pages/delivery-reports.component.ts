/**
 * Delivery reports - the deliveries management should read.
 *
 * The storekeeper receives at the door. When something went wrong there -
 * goods sent back with the driver, an order still short after the lorry left,
 * or more arriving than the order still owed - the delivery lands here, unread, with a count beside the menu entry
 * and on the Overview. Each report answers the four questions in the order
 * they matter: what went back and why, the order as this delivery found it,
 * what is still to come now, what did come, and what was taken off the order.
 *
 * "As this delivery found it" is a record of that day and never moves. "Still
 * to come" is now. Reading the second alone is how a box that was simply still
 * owed came to look like a credited one being sent again.
 *
 * Management can act from the report itself: record the credit note for goods
 * the supplier is crediting, void an item that is never coming, print it, and
 * mark it read.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { BadgeStore } from '@/core/badge.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty, packsOrUnits } from '@/core/format';
import { openPrint } from '@/core/print';
import {
    DEFAULT_PAGE_SIZE,
    emptyPage,
    type DeliveryReportRow,
    type GrnArrivalLine,
    type GrnDetail,
    type GrnRejection,
    type Page,
    type PageRequest
} from '@/core/types';
import { AppPaginator, type PageChange } from '@/shared/paginator.component';
import { AppFilterBar, type FilterOption } from '@/shared/filter-bar.component';

type OrderLine = NonNullable<GrnDetail['order']>['lines'][number];

@Component({
    selector: 'app-delivery-reports',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        DrawerModule,
        InputTextModule,
        TagModule,
        AppPaginator,
        AppFilterBar
    ],
    template: `
        <div class="space-y-6">
            <div>
                <h1 class="text-2xl font-bold">Delivery reports</h1>
                <p class="text-surface-500 text-sm">
                    Deliveries that came with goods sent back, or left an order short. Read each
                    one, deal with what needs dealing with, and mark it read.
                </p>
            </div>

            @if (error()) {
                <div class="app-note app-note--error">{{ error() }}</div>
            }

            <app-filter-bar
                label="Which reports"
                [options]="filterOptions()"
                [value]="unseenOnly()"
                (valueChange)="setUnseen($event)" />

            @if (rows().length === 0) {
                <div
                    class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-10 text-center text-surface-500">
                    @if (loading()) {
                        Loading…
                    } @else if (unseenOnly()) {
                        <i class="pi pi-check-circle text-2xl text-primary mb-2 block" aria-hidden="true"></i>
                        You are up to date. Nothing new from the door.
                    } @else {
                        No delivery has needed a report yet.
                    }
                </div>
            } @else {
                <ul class="space-y-3">
                    @for (row of rows(); track row.id) {
                        <li>
                            <button
                                type="button"
                                class="w-full text-left rounded-2xl border bg-surface-0 dark:bg-surface-900 px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:shadow-md transition border-l-4"
                                [class.border-surface]="!!row.reviewedAt"
                                [class.border-l-primary]="!row.reviewedAt"
                                [class.border-l-transparent]="!!row.reviewedAt"
                                (click)="open(row)">
                                <div class="min-w-0 space-y-1.5">
                                    <div class="font-semibold">
                                        {{ row.supplierName }}
                                        <span class="text-surface-500 font-normal text-sm">
                                            · delivery no. <span class="font-mono">{{ row.id }}</span>
                                            @if (row.poId) {
                                                · order no. <span class="font-mono">{{ row.poId }}</span>
                                            }
                                        </span>
                                    </div>
                                    <div class="text-xs text-surface-500">
                                        {{ when(row.receivedAt) }} · received by {{ row.receivedBy }}
                                    </div>
                                    <div class="flex flex-wrap gap-2 text-xs">
                                        <span class="report-chip">
                                            <i class="pi pi-check" aria-hidden="true"></i>
                                            {{ row.receivedCount }} received
                                        </span>
                                        @if (row.returnedCount > 0) {
                                            <span class="report-chip report-chip--back">
                                                <i class="pi pi-replay" aria-hidden="true"></i>
                                                {{ row.returnedCount }} sent back
                                            </span>
                                        }
                                        @if (row.overCount > 0) {
                                            <span class="report-chip report-chip--todo">
                                                <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                                                {{ row.overCount }} more than owed
                                            </span>
                                        }
                                        @if (row.notOnOrderCount > 0) {
                                            <span class="report-chip report-chip--todo">
                                                <i class="pi pi-question-circle" aria-hidden="true"></i>
                                                {{ row.notOnOrderCount }} not on the order
                                            </span>
                                        }
                                        @if (row.shortCount > 0) {
                                            <span class="report-chip report-chip--wait">
                                                <i class="pi pi-clock" aria-hidden="true"></i>
                                                left {{ row.shortCount }} short
                                            </span>
                                        }
                                        @if (row.outstandingCount > 0) {
                                            <span class="report-chip">
                                                {{ row.outstandingCount }} still to come now
                                            </span>
                                        }
                                        @if (row.creditsPending > 0) {
                                            <span class="report-chip report-chip--todo">
                                                <i class="pi pi-file" aria-hidden="true"></i>
                                                {{ row.creditsPending }} credit note{{ row.creditsPending === 1 ? '' : 's' }} to record
                                            </span>
                                        }
                                    </div>
                                </div>
                                <div class="flex items-center gap-3 shrink-0">
                                    @if (row.reviewedAt) {
                                        <span class="text-xs text-surface-500 text-right">
                                            Read by {{ row.reviewedBy }}<br />{{ day(row.reviewedAt) }}
                                        </span>
                                    } @else {
                                        <p-tag value="New"></p-tag>
                                    }
                                    <i class="pi pi-chevron-right text-surface-400" aria-hidden="true"></i>
                                </div>
                            </button>
                        </li>
                    }
                </ul>
                <app-paginator [page]="pageInfo()" (pageChange)="onPageChange($event)" />
            }
        </div>

        <!-- ── One report ──────────────────────────────────────────────── -->
        <p-drawer
            [visible]="detailOpen()"
            (visibleChange)="detailOpen.set($event)"
            position="right"
            header="Delivery report"
            styleClass="!w-full sm:!w-[46rem]">
            @if (detailLoading()) {
                <p class="text-surface-500">Loading…</p>
            }
            @if (!detailLoading() && detail(); as d) {
                <div class="space-y-6">
                    <!-- Who, when, against what -->
                    <div>
                        <div class="text-xl font-semibold">{{ d.supplierName }}</div>
                        <div class="text-sm text-surface-500 mt-1">
                            Delivery no. <span class="font-mono">{{ d.id }}</span>
                            @if (d.invoiceNo) {
                                · invoice {{ d.invoiceNo }}
                            }
                            @if (d.order; as o) {
                                · order no. <span class="font-mono">{{ o.id }}</span> raised
                                {{ day(o.raisedAt) }} by {{ o.raisedBy }}
                            }
                        </div>
                        <div class="text-sm text-surface-500">
                            Received {{ when(d.receivedAt) }} by {{ d.receivedBy }}
                        </div>
                    </div>

                    <!-- At a glance -->
                    <div class="grid grid-cols-3 gap-3">
                        <div class="report-stat">
                            <div class="report-stat__n">{{ d.lines.length + d.otherLines.length }}</div>
                            <div class="report-stat__l">received</div>
                        </div>
                        <div class="report-stat" [class.report-stat--back]="d.rejections.length > 0">
                            <div class="report-stat__n">{{ d.rejections.length }}</div>
                            <div class="report-stat__l">sent back</div>
                        </div>
                        <div class="report-stat" [class.report-stat--wait]="leftShort(d).length > 0">
                            <div class="report-stat__n">{{ leftShort(d).length }}</div>
                            <div class="report-stat__l">left owing</div>
                        </div>
                    </div>

                    <!-- More came than was owed, or something nobody ordered. -->
                    @if (over(d).length > 0 || notOnOrder(d).length > 0) {
                        <div class="app-note app-note--error">
                            <div class="app-note__title">More came than the order asked for</div>
                            <ul class="mt-1 list-disc pl-5">
                                @for (a of over(d); track a.poLineId) {
                                    <li>
                                        {{ a.name }}: {{ p(a.qtyOverBase, a) }} beyond the
                                        {{ p(a.qtyOwedBeforeBase, a) }} still owed
                                    </li>
                                }
                                @for (l of notOnOrder(d); track l.id) {
                                    <li>{{ l.itemName }}: {{ l.qtyPacks }} × {{ l.packName }}, not on the order at all</li>
                                }
                            </ul>
                            <p class="mt-1">
                                It was received into stock. Check it is not goods already credited or
                                sent twice - if it is, the supplier is owed nothing more for it.
                            </p>
                        </div>
                    }

                    <!-- 1. Sent back -->
                    @if (d.rejections.length > 0) {
                        <section class="space-y-2">
                            <h2 class="section-title text-orange-700 dark:text-orange-300">
                                <i class="pi pi-replay" aria-hidden="true"></i>
                                Sent back with the driver
                            </h2>
                            <ul class="rounded-xl border border-surface divide-y divide-surface">
                                @for (r of d.rejections; track r.id) {
                                    <li class="px-4 py-3 space-y-2">
                                        <div class="flex flex-wrap items-start justify-between gap-3">
                                            <div class="min-w-0">
                                                <div class="font-medium">{{ r.name }}</div>
                                                <div class="text-sm text-surface-500">
                                                    {{ r.reasonLabel }}
                                                    @if (r.note) {
                                                        - “{{ r.note }}”
                                                    }
                                                </div>
                                            </div>
                                            <div class="text-right">
                                                <div class="font-semibold">{{ rejectionQty(r) }}</div>
                                                @if (r.isStockItem) {
                                                    <div class="text-xs text-surface-500">{{ q(r.qtyBase, r.unit) }}</div>
                                                }
                                            </div>
                                        </div>
                                        @if (r.outcome === 'replacement') {
                                            <div class="text-sm">
                                                <p-tag severity="info" value="Replacement"></p-tag>
                                                <span class="text-surface-500 ml-1">
                                                    The supplier is sending it again - it is still on the order.
                                                </span>
                                            </div>
                                        } @else if (r.creditNoteNo) {
                                            <div class="text-sm">
                                                <p-tag severity="success" value="Credit note"></p-tag>
                                                <span class="ml-1 font-mono">{{ r.creditNoteNo }}</span>
                                            </div>
                                        } @else {
                                            <div class="flex flex-wrap items-center gap-2">
                                                <p-tag severity="warn" value="Credit note to come"></p-tag>
                                                <input
                                                    pInputText
                                                    class="w-44"
                                                    placeholder="Credit note no."
                                                    [attr.aria-label]="'Credit note number for ' + r.name"
                                                    [ngModel]="creditDraft()[r.id] ?? ''"
                                                    (ngModelChange)="setCreditDraft(r.id, $event)" />
                                                <button
                                                    pButton
                                                    size="small"
                                                    outlined
                                                    label="Save"
                                                    [disabled]="!(creditDraft()[r.id] ?? '').trim() || busy()"
                                                    (click)="saveCredit(d, r)"></button>
                                            </div>
                                        }
                                    </li>
                                }
                            </ul>
                        </section>
                    }

                    <!-- 2. The order as this delivery found it -->
                    @if (d.order && d.atArrival.length > 0) {
                        <section class="space-y-2">
                            <h2 class="section-title">
                                <i class="pi pi-list" aria-hidden="true"></i>
                                Order no. {{ d.order.id }} when this delivery arrived
                            </h2>
                            <div class="rounded-xl border border-surface overflow-x-auto">
                                <table class="w-full text-sm">
                                    <thead class="text-xs text-surface-500">
                                        <tr class="border-b border-surface">
                                            <th class="text-left font-medium px-4 py-2">Item</th>
                                            <th class="text-right font-medium px-2 py-2">Ordered</th>
                                            <th class="text-right font-medium px-2 py-2">Owed then</th>
                                            <th class="text-right font-medium px-2 py-2">Came</th>
                                            <th class="text-right font-medium px-2 py-2">Sent back</th>
                                            <th class="text-right font-medium px-4 py-2">Left owing</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (a of d.atArrival; track a.poLineId) {
                                            <tr class="border-b border-surface last:border-b-0 align-top">
                                                <td class="px-4 py-2 font-medium">
                                                    {{ a.name }}
                                                    @if (a.qtyOverBase > 0) {
                                                        <span class="block text-xs font-semibold text-red-600 dark:text-red-400">
                                                            {{ p(a.qtyOverBase, a) }} more than owed
                                                        </span>
                                                    }
                                                </td>
                                                <td class="px-2 py-2 text-right whitespace-nowrap">{{ p(a.qtyOrderedBase, a) }}</td>
                                                <td class="px-2 py-2 text-right whitespace-nowrap">{{ p(a.qtyOwedBeforeBase, a) }}</td>
                                                <td class="px-2 py-2 text-right whitespace-nowrap">
                                                    {{ a.qtyReceivedBase > 0 ? p(a.qtyReceivedBase, a) : '-' }}
                                                </td>
                                                <td class="px-2 py-2 text-right whitespace-nowrap">
                                                    {{ a.qtyRefusedBase > 0 ? p(a.qtyRefusedBase, a) : '-' }}
                                                    @if (a.qtyCreditedBase > 0) {
                                                        <span class="block text-xs text-surface-500">credited</span>
                                                    }
                                                </td>
                                                <td
                                                    class="px-4 py-2 text-right whitespace-nowrap font-semibold"
                                                    [class.text-orange-600]="a.qtyOwedAfterBase > 0">
                                                    {{ a.qtyOwedAfterBase > 0 ? p(a.qtyOwedAfterBase, a) : '-' }}
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                            <p class="text-xs text-surface-500">
                                As it stood on {{ when(d.receivedAt) }}. Sent back for a credit is no longer
                                owed; sent back for a replacement still is.
                            </p>
                        </section>
                    }

                    <!-- 3. Still to come -->
                    @if (d.order) {
                        <section class="space-y-2">
                            <h2 class="section-title">
                                <i class="pi pi-clock" aria-hidden="true"></i>
                                Still not delivered
                                <span class="text-xs font-normal text-surface-500">- as of now</span>
                            </h2>
                            @if (outstanding(d).length === 0) {
                                <p class="text-sm text-surface-500">
                                    Nothing - the order is {{ d.order.status === 'done' ? 'closed' : 'complete' }}.
                                </p>
                            } @else {
                                <ul class="rounded-xl border border-surface divide-y divide-surface">
                                    @for (l of outstanding(d); track l.id) {
                                        <li class="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                                            <span class="font-medium">{{ l.name }}</span>
                                            <span class="flex items-center gap-3">
                                                <span class="font-semibold">{{ q(l.qtyOutstandingBase, l.unit) }}</span>
                                                <button
                                                    pButton
                                                    size="small"
                                                    text
                                                    severity="danger"
                                                    label="Void"
                                                    [attr.aria-label]="'Take ' + l.name + ' off the order'"
                                                    [disabled]="busy()"
                                                    (click)="voidLine(d, l)"></button>
                                            </span>
                                        </li>
                                    }
                                </ul>
                                <p class="text-xs text-surface-500">
                                    The order stays open until these arrive. Void one if it is never coming.
                                </p>
                            }
                        </section>
                    }

                    <!-- 4. What came -->
                    <section class="space-y-2">
                        <h2 class="section-title">
                            <i class="pi pi-check" aria-hidden="true"></i>
                            Received into stock
                        </h2>
                        @if (d.lines.length + d.otherLines.length === 0) {
                            <p class="text-sm text-surface-500">Nothing - everything on it went back.</p>
                        } @else {
                            <ul class="rounded-xl border border-surface divide-y divide-surface">
                                @for (l of d.lines; track l.id) {
                                    <li class="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
                                        <span class="font-medium">
                                            {{ l.itemName }}
                                            @if (l.notOnOrder) {
                                                <span class="text-xs text-red-600 dark:text-red-400 font-normal">· not on the order</span>
                                            }
                                        </span>
                                        <span class="text-right">
                                            {{ l.qtyPacks }} × {{ l.packName }}
                                            <span class="text-surface-500">= {{ q(l.qtyBase, l.stockUnit) }}</span>
                                            @if (l.expiryDate) {
                                                <span class="block text-xs text-surface-500">expires {{ l.expiryDate }}</span>
                                            }
                                        </span>
                                    </li>
                                }
                                @for (l of d.otherLines; track l.id) {
                                    <li class="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
                                        <span class="font-medium">
                                            {{ l.name }} <span class="text-xs text-surface-500 font-normal">· not stock</span>
                                        </span>
                                        <span>{{ l.qty }} {{ l.unit || 'each' }}</span>
                                    </li>
                                }
                            </ul>
                        }
                    </section>

                    <!-- 5. Voided -->
                    @if (voided(d).length > 0) {
                        <section class="space-y-2">
                            <h2 class="section-title">
                                <i class="pi pi-ban" aria-hidden="true"></i>
                                Taken off the order
                            </h2>
                            <ul class="rounded-xl border border-surface divide-y divide-surface text-sm">
                                @for (l of voided(d); track l.id) {
                                    <li class="px-4 py-2.5">
                                        <span class="font-medium line-through">{{ l.name }}</span>
                                        <span class="text-surface-500"> - “{{ l.voidReason }}”</span>
                                    </li>
                                }
                            </ul>
                        </section>
                    }

                    <!-- Done with it -->
                    <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-surface">
                        <button
                            pButton
                            outlined
                            icon="pi pi-print"
                            label="Print"
                            (click)="print(d.id)"></button>
                        @if (d.reviewedAt) {
                            <span class="text-sm text-surface-500">
                                <i class="pi pi-check-circle text-primary" aria-hidden="true"></i>
                                Read by {{ d.reviewedBy }} · {{ when(d.reviewedAt) }}
                            </span>
                        } @else {
                            <button
                                pButton
                                icon="pi pi-check"
                                label="Mark as read"
                                [loading]="busy()"
                                [disabled]="busy()"
                                (click)="markRead(d)"></button>
                        }
                    </div>
                </div>
            }
        </p-drawer>
    `,
    styles: `
        .report-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.15rem 0.55rem;
            border-radius: 999px;
            background: var(--p-surface-100);
            color: var(--p-surface-700);
        }
        :host-context(.app-dark) .report-chip {
            background: var(--p-surface-800);
            color: var(--p-surface-200);
        }
        .report-chip--back {
            background: #ffedd5;
            color: #9a3412;
        }
        .report-chip--wait {
            background: #fef9c3;
            color: #854d0e;
        }
        .report-chip--todo {
            background: #fee2e2;
            color: #991b1b;
        }
        :host-context(.app-dark) .report-chip--back {
            background: #431407;
            color: #fdba74;
        }
        :host-context(.app-dark) .report-chip--wait {
            background: #422006;
            color: #fde047;
        }
        :host-context(.app-dark) .report-chip--todo {
            background: #450a0a;
            color: #fca5a5;
        }
        .report-stat {
            border: 1px solid var(--p-content-border-color);
            border-radius: 0.75rem;
            padding: 0.75rem 1rem;
            text-align: center;
        }
        .report-stat__n {
            font-size: 1.6rem;
            font-weight: 700;
            line-height: 1.1;
        }
        .report-stat__l {
            font-size: 0.75rem;
            color: var(--p-text-muted-color);
        }
        .report-stat--back .report-stat__n {
            color: #ea580c;
        }
        .report-stat--wait .report-stat__n {
            color: #ca8a04;
        }
        .section-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 600;
        }
    `
})
export class DeliveryReportsComponent implements OnInit {
    private api = inject(GrandService);
    private notify = inject(NotifyService);
    private badges = inject(BadgeStore);

    readonly rows = signal<DeliveryReportRow[]>([]);
    readonly pageInfo = signal<Page<DeliveryReportRow>>(emptyPage<DeliveryReportRow>());
    readonly pageReq = signal<PageRequest>({ page: 1, limit: DEFAULT_PAGE_SIZE });
    readonly unseenOnly = signal(true);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);

    readonly detail = signal<GrnDetail | null>(null);
    readonly detailOpen = signal(false);
    readonly detailLoading = signal(false);
    readonly creditDraft = signal<Record<string, string | undefined>>({});

    readonly filterOptions = computed<FilterOption<boolean>[]>(() => {
        const n = this.badges.deliveryReports();
        return [
            { value: true, label: n > 0 ? `New (${n})` : 'New' },
            { value: false, label: 'All' }
        ];
    });

    async ngOnInit(): Promise<void> {
        await this.load();
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            const page = await this.api.listDeliveryReports({
                ...this.pageReq(),
                unseen: this.unseenOnly() || undefined
            });
            this.pageInfo.set(page);
            this.rows.set(page.items);
            this.error.set(null);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    setUnseen(on: boolean): void {
        if (this.unseenOnly() === on) return;
        this.unseenOnly.set(on);
        this.pageReq.update((q) => ({ ...q, page: 1 }));
        void this.load();
    }

    onPageChange(e: PageChange): void {
        this.pageReq.set(e);
        void this.load();
    }

    async open(row: DeliveryReportRow): Promise<void> {
        this.detail.set(null);
        this.creditDraft.set({});
        this.detailOpen.set(true);
        await this.reloadDetail(row.id);
    }

    private async reloadDetail(id: string): Promise<void> {
        this.detailLoading.set(this.detail() === null);
        try {
            this.detail.set(await this.api.getGrn(id));
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
            this.detailOpen.set(false);
        } finally {
            this.detailLoading.set(false);
        }
    }

    async markRead(d: GrnDetail): Promise<void> {
        this.busy.set(true);
        try {
            await this.api.markDeliveryReportSeen(d.id);
            this.notify.success('Marked as read');
            this.detailOpen.set(false);
            await Promise.all([this.load(), this.badges.refresh()]);
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    setCreditDraft(id: string, value: string): void {
        this.creditDraft.update((m) => ({ ...m, [id]: value }));
    }

    async saveCredit(d: GrnDetail, r: GrnRejection): Promise<void> {
        const no = (this.creditDraft()[r.id] ?? '').trim();
        if (!no) return;
        this.busy.set(true);
        try {
            await this.api.recordRejectionCreditNote(r.id, no);
            this.notify.success(`Credit note ${no} recorded`);
            await Promise.all([this.reloadDetail(d.id), this.load()]);
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async voidLine(d: GrnDetail, l: OrderLine): Promise<void> {
        if (!d.order) return;
        const reason = await this.notify.prompt(
            `${l.name} will be taken off order no. ${d.order.id}. What it was ordered for stays on record. Why is it not coming?`,
            'Void this item',
            '',
            'Void it'
        );
        if (reason === null) return;
        if (reason.trim().length < 3) {
            this.notify.warning('Give a short reason.');
            return;
        }
        this.busy.set(true);
        try {
            const res = await this.api.voidPoLine(d.order.id, l.id, reason.trim());
            this.notify.success(
                res.orderComplete
                    ? `${l.name} voided. Nothing else is outstanding - the order is closed.`
                    : `${l.name} taken off the order`
            );
            await Promise.all([this.reloadDetail(d.id), this.load()]);
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    print(grnId: string): void {
        openPrint(`/deliveries/${grnId}/print`);
    }

    outstanding(d: GrnDetail): OrderLine[] {
        return d.order?.lines.filter((l) => l.qtyOutstandingBase > 0) ?? [];
    }

    voided(d: GrnDetail): OrderLine[] {
        return d.order?.lines.filter((l) => l.voided) ?? [];
    }

    /** What this delivery left owing, as it was that day. */
    leftShort(d: GrnDetail): GrnArrivalLine[] {
        return d.atArrival.filter((a) => a.qtyOwedAfterBase > 0);
    }

    over(d: GrnDetail): GrnArrivalLine[] {
        return d.atArrival.filter((a) => a.qtyOverBase > 0);
    }

    notOnOrder(d: GrnDetail) {
        return d.lines.filter((l) => l.notOnOrder);
    }

    p(qty: number, a: GrnArrivalLine): string {
        return packsOrUnits(qty, a.unit, a.packName, a.packSize);
    }

    rejectionQty(r: GrnRejection): string {
        return r.isStockItem ? `${r.qty} × ${r.packName}` : `${r.qty} ${r.unit || 'each'}`;
    }

    q(qty: number, unit: string | null): string {
        return formatQty(qty, unit ?? '');
    }

    day(iso: string): string {
        return new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' });
    }

    when(iso: string): string {
        return new Date(iso).toLocaleString('en-LK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
