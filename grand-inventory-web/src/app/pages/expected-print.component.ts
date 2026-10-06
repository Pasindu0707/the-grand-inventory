/**
 * The delivery checklist, printed.
 *
 * What is still to come from a supplier, on paper, so the storekeeper can stand
 * at the lorry with a clipboard and tick it off by hand: one tick box per item,
 * with blanks for how many came, how many were bad and the expiry. Then it is
 * keyed into Receive delivery from the sheet.
 *
 * One page per supplier, each of its open orders as a section. Opened for one
 * supplier (`?supplier=`), one order (`?po=`) or every supplier at once (no
 * parameter). `?print=1` opens the print dialog as soon as the sheet is ready.
 *
 * Only orders a delivery can be booked against are on it - approved or on
 * order. An order still waiting for management is not expected yet.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import type { Item, PurchaseOrder, PurchaseOrderLine, Supplier } from '@/core/types';
import { PRINT_STYLES } from './print-styles';

interface Sheet {
    supplierName: string;
    phone: string | null;
    orders: PurchaseOrder[];
}

@Component({
    selector: 'app-expected-print',
    standalone: true,
    imports: [CommonModule],
    styles: [
        PRINT_STYLES,
        `
            .tick {
                display: block;
                width: 5.5mm;
                height: 5.5mm;
                border: 1.5px solid #111;
                border-radius: 1mm;
                margin: 0 auto;
            }
            /* A grid to write in: every cell boxed, rows tall enough for a pen. */
            table.checklist th,
            table.checklist td {
                border: 1px solid #bbb;
                padding: 2.5mm 2mm;
                vertical-align: middle;
            }
            table.checklist th {
                border-bottom: 1.5px solid #111;
                background: #f3f3f3;
            }
            table.checklist td.blank {
                width: 20mm;
            }
            .order {
                margin-bottom: 7mm;
                break-inside: avoid;
            }
            .order h2 {
                display: flex;
                justify-content: space-between;
                gap: 4mm;
                border-bottom: 1px solid #111;
                padding-bottom: 1.5mm;
            }
            .order h2 span {
                font-weight: 400;
                font-size: 9pt;
                color: #555;
            }
            .page-break {
                break-after: page;
            }
            .notes {
                border: 1px solid #ccc;
                height: 20mm;
                margin-top: 4mm;
                padding: 2mm 3mm;
                font-size: 8.5pt;
                color: #777;
            }
            .empty {
                text-align: center;
                padding: 30mm 0;
                color: #555;
            }
        `
    ],
    template: `
        <div class="toolbar">
            <button type="button" (click)="close()">Close tab</button>
            <button type="button" class="primary" [disabled]="loading()" (click)="print()">
                Print
            </button>
        </div>

        @if (error()) {
            <div class="sheet"><p>{{ error() }}</p></div>
        } @else if (loading()) {
            <div class="sheet"><p>Loading…</p></div>
        } @else if (sheets().length === 0) {
            <div class="sheet empty">
                <p>Nothing is expected from this supplier right now.</p>
                <p class="muted">Only approved orders, or orders already on order, are printed.</p>
            </div>
        }

        @for (s of sheets(); track s.supplierName; let last = $last) {
            <div class="sheet" [class.page-break]="!last">
                <div class="head">
                    <div>
                        <h1>DELIVERY CHECKLIST</h1>
                        <div class="muted">To be delivered · {{ branch() }}</div>
                    </div>
                    <div class="docno">
                        <div class="muted">Supplier</div>
                        <div class="supplier">{{ s.supplierName }}</div>
                        @if (s.phone) {
                            <div class="muted">{{ s.phone }}</div>
                        }
                    </div>
                </div>

                <div class="facts">
                    <div>
                        <div class="k">Orders</div>
                        <div class="v">{{ s.orders.length }}</div>
                    </div>
                    <div>
                        <div class="k">Items expected</div>
                        <div class="v">{{ itemCount(s) }}</div>
                    </div>
                    <div>
                        <div class="k">Delivery date</div>
                        <div class="v">____ / ____ / ________</div>
                    </div>
                </div>

                @for (o of s.orders; track o.id) {
                    <div class="order">
                        <h2>
                            Order no. {{ o.id }}
                            <span>
                                raised {{ date(o.raisedAt) }} by {{ o.raisedBy }}
                                @if (o.neededBy) {
                                    · needed by {{ date(o.neededBy) }}
                                }
                            </span>
                        </h2>
                        <table class="checklist">
                            <thead>
                                <tr>
                                    <th style="width: 9mm; text-align: center">✓</th>
                                    <th>Item</th>
                                    <th>Code</th>
                                    <th class="num">Expected</th>
                                    <th class="num">Total</th>
                                    <th>Qty came</th>
                                    <th>Bad / back</th>
                                    <th>Expiry</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (l of outstanding(o); track l.id) {
                                    <tr>
                                        <td><span class="tick"></span></td>
                                        <td>
                                            {{ l.name }}
                                            @if (!l.isStockItem) {
                                                <span class="muted">(not stock)</span>
                                            }
                                        </td>
                                        <td>{{ code(l) }}</td>
                                        <td class="num total">{{ expectedPacks(l) }}</td>
                                        <td class="num">{{ expectedTotal(l) }}</td>
                                        <td class="blank"></td>
                                        <td class="blank"></td>
                                        <td class="blank"></td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                }

                <div class="notes">Notes - anything short, damaged or sent back with the driver</div>

                <div class="signs">
                    <div class="sign">
                        <div class="line"></div>
                        <div class="label">Checked by - storekeeper (name, signature, date)</div>
                    </div>
                    <div class="sign">
                        <div class="line"></div>
                        <div class="label">Delivered by - driver (name, signature)</div>
                    </div>
                </div>

                <div class="foot">
                    Printed {{ when(printedAt) }} by {{ printedBy() }} · Enter what came in Receive delivery
                </div>
            </div>
        }
    `
})
export class ExpectedPrintComponent implements OnInit {
    private api = inject(GrandService);
    private auth = inject(AuthStore);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    readonly loading = signal(true);
    readonly error = signal<string | null>(null);
    private readonly orders = signal<PurchaseOrder[]>([]);
    private readonly items = signal<Item[]>([]);
    private readonly suppliers = signal<Supplier[]>([]);
    readonly printedAt = new Date().toISOString();

    readonly sheets = computed<Sheet[]>(() => {
        const q = this.route.snapshot.queryParamMap;
        const supplierId = Number(q.get('supplier')) || null;
        const poId = q.get('po');

        const wanted = this.orders()
            .filter((o) => o.status === 'approved' || o.status === 'ordered')
            .filter((o) => (poId ? o.id === poId : true))
            .filter((o) => (supplierId ? o.supplierId === supplierId : true))
            .filter((o) => this.outstanding(o).length > 0);

        const by = new Map<string, Sheet>();
        for (const o of wanted) {
            const name = o.supplierName ?? 'No supplier';
            const sheet = by.get(name) ?? {
                supplierName: name,
                phone: this.suppliers().find((s) => s.id === o.supplierId)?.phone ?? null,
                orders: []
            };
            sheet.orders.push(o);
            by.set(name, sheet);
        }
        return [...by.values()]
            .map((s) => ({ ...s, orders: s.orders.sort((a, b) => Number(a.id) - Number(b.id)) }))
            .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
    });

    branch(): string {
        return this.auth.location()?.name ?? '';
    }

    printedBy(): string {
        return this.auth.user()?.name ?? '';
    }

    async ngOnInit(): Promise<void> {
        try {
            const [page, items, suppliers] = await Promise.all([
                this.api.listPurchaseOrders({ open: true, limit: 100 }),
                this.api.listItems(),
                this.api.listSuppliers()
            ]);
            this.orders.set(page.items);
            this.items.set(items);
            this.suppliers.set(suppliers);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }

        if (this.route.snapshot.queryParamMap.get('print') === '1' && this.sheets().length > 0) {
            // After the sheet has painted, or the dialog prints a blank page.
            setTimeout(() => window.print(), 400);
        }
    }

    print(): void {
        window.print();
    }

    /** Opened in its own tab; a browser that refuses to close it gets the delivery screen. */
    close(): void {
        window.close();
        setTimeout(() => void this.router.navigate(['/grn']), 300);
    }

    outstanding(o: PurchaseOrder): PurchaseOrderLine[] {
        return o.lines.filter((l) => !l.voided && l.qtyOutstandingBase > 0);
    }

    itemCount(s: Sheet): number {
        return s.orders.reduce((n, o) => n + this.outstanding(o).length, 0);
    }

    code(l: PurchaseOrderLine): string {
        return this.items().find((i) => i.id === l.itemId)?.code ?? '';
    }

    /** "2 × 25 kg sack" - what is still to come, in the packs it was ordered in. */
    expectedPacks(l: PurchaseOrderLine): string {
        if (!l.isStockItem) return `${l.qtyOutstandingBase} ${l.stockUnit || 'each'}`;
        const size = l.qtyPacks ? l.qtyBase / l.qtyPacks : 0;
        if (!size || !l.packName) return formatQty(l.qtyOutstandingBase, l.stockUnit ?? '');
        const packs = Math.round((l.qtyOutstandingBase / size) * 1000) / 1000;
        return `${packs} × ${l.packName}`;
    }

    expectedTotal(l: PurchaseOrderLine): string {
        return l.isStockItem ? formatQty(l.qtyOutstandingBase, l.stockUnit ?? '') : '';
    }

    date(iso: string): string {
        return new Date(iso).toLocaleDateString('en-LK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
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
