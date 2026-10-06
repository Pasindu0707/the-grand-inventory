/**
 * A delivery note, printed.
 *
 * The storekeeper files a paper copy of every delivery: what came, in packs and
 * in kilos, litres or count, when, from whom, against which order, and what is
 * still to come on it. Signed at the door by whoever received it and whoever
 * delivered it.
 *
 * Its own route, outside the console layout, so the sidebar and header never
 * reach the paper. The page is always black on white - it is a picture of a
 * sheet of A4, whatever theme the screen is in.
 *
 * Two views of the order, kept apart on purpose. "Against order no. N" is the
 * order as this delivery found it - what was ordered, what was still owed when
 * the lorry arrived, what came, what went back, what it left owing - and it
 * never changes. "Still to come" is the order as it stands when printed, and
 * says so. Without the first, a box that was simply still owed looks, a
 * delivery later, like a credited box coming back.
 */
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty, packsOrUnits } from '@/core/format';
import type { GrnArrivalLine, GrnDetail } from '@/core/types';
import { PRINT_STYLES } from './print-styles';

@Component({
    selector: 'app-delivery-print',
    standalone: true,
    imports: [CommonModule],
    styles: [PRINT_STYLES],
    template: `
        <div class="toolbar">
            <button type="button" (click)="back()">Close tab</button>
            <button type="button" class="primary" [disabled]="!grn()" (click)="print()">
                Print
            </button>
        </div>

        @if (error()) {
            <div class="sheet"><p>{{ error() }}</p></div>
        }
        @if (grn(); as d) {
            <div class="sheet">
                <div class="head">
                    <div>
                        <h1>DELIVERY NOTE</h1>
                        <div class="muted">Goods received · {{ branch() }}</div>
                    </div>
                    <div class="docno">
                        <div class="muted">Delivery no.</div>
                        <div class="no">{{ d.id }}</div>
                    </div>
                </div>

                <div class="facts">
                    <div>
                        <div class="k">Supplier</div>
                        <div class="v">{{ d.supplierName }}</div>
                    </div>
                    <div>
                        <div class="k">Invoice no.</div>
                        <div class="v">{{ d.invoiceNo || '-' }}</div>
                    </div>
                    <div>
                        <div class="k">Invoice date</div>
                        <div class="v">{{ d.invoiceDate ? date(d.invoiceDate) : '-' }}</div>
                    </div>
                    <div>
                        <div class="k">Received</div>
                        <div class="v">{{ when(d.receivedAt) }}</div>
                    </div>
                    <div>
                        <div class="k">Received by</div>
                        <div class="v">{{ d.receivedBy }}</div>
                    </div>
                    <div>
                        <div class="k">Purchase order</div>
                        <div class="v">{{ d.order ? 'No. ' + d.order.id : 'Not ordered' }}</div>
                    </div>
                    @if (d.order; as o) {
                        <div>
                            <div class="k">Order raised</div>
                            <div class="v">{{ date(o.raisedAt) }} by {{ o.raisedBy }}</div>
                        </div>
                        <div>
                            <div class="k">Needed by</div>
                            <div class="v">{{ o.neededBy ? date(o.neededBy) : '-' }}</div>
                        </div>
                    }
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item</th>
                            <th>Code</th>
                            <th class="num">Received</th>
                            <th class="num">Total</th>
                            <th>Expiry</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (l of d.lines; track l.id; let i = $index) {
                            <tr>
                                <td>{{ i + 1 }}</td>
                                <td>
                                    {{ l.itemName }}
                                    @if (l.notOnOrder) {
                                        <span class="muted">(not on the order)</span>
                                    }
                                </td>
                                <td>{{ l.itemCode }}</td>
                                <td class="num">{{ l.qtyPacks }} × {{ l.packName }}</td>
                                <td class="num total">{{ q(l.qtyBase, l.stockUnit) }}</td>
                                <td>{{ l.expiryDate ? date(l.expiryDate) : '' }}</td>
                            </tr>
                        }
                        @for (l of d.otherLines; track l.id; let i = $index) {
                            <tr>
                                <td>{{ d.lines.length + i + 1 }}</td>
                                <td>{{ l.name }} <span class="muted">(not stock)</span></td>
                                <td></td>
                                <td class="num">{{ l.qty }} {{ l.unit || 'each' }}</td>
                                <td class="num total">{{ l.qty }} {{ l.unit || 'each' }}</td>
                                <td></td>
                            </tr>
                        }
                    </tbody>
                </table>

                @if (d.order && d.atArrival.length > 0) {
                    <div class="box">
                        <h2>Against order no. {{ d.order.id }} - as it stood when this delivery arrived</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th class="num">Ordered</th>
                                    <th class="num">Owed on arrival</th>
                                    <th class="num">Received</th>
                                    <th class="num">Sent back</th>
                                    <th class="num">Left owing</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (a of d.atArrival; track a.poLineId) {
                                    <tr>
                                        <td>
                                            {{ a.name }}
                                            @if (a.qtyOverBase > 0) {
                                                <div class="total">
                                                    {{ p(a.qtyOverBase, a) }} more than was owed
                                                </div>
                                            }
                                        </td>
                                        <td class="num">{{ p(a.qtyOrderedBase, a) }}</td>
                                        <td class="num">{{ p(a.qtyOwedBeforeBase, a) }}</td>
                                        <td class="num">{{ a.qtyReceivedBase > 0 ? p(a.qtyReceivedBase, a) : '-' }}</td>
                                        <td class="num">
                                            {{ a.qtyRefusedBase > 0 ? p(a.qtyRefusedBase, a) : '-' }}
                                            @if (a.qtyCreditedBase > 0) {
                                                <div class="muted">credited</div>
                                            }
                                        </td>
                                        <td class="num total">{{ a.qtyOwedAfterBase > 0 ? p(a.qtyOwedAfterBase, a) : '-' }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                        <div class="muted" style="font-size: 8.5pt">
                            Owed on arrival is what was ordered, less earlier deliveries and credit notes.
                            Sent back for a credit is no longer owed; sent back for a replacement still is.
                        </div>
                    </div>
                }

                @if (d.rejections.length > 0) {
                    <div class="box">
                        <h2>Sent back with the driver - not received</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th class="num">Returned</th>
                                    <th>Reason</th>
                                    <th>Supplier owes</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (r of d.rejections; track r.id) {
                                    <tr>
                                        <td>{{ r.name }}</td>
                                        <td class="num total">
                                            {{ r.isStockItem ? r.qty + ' × ' + r.packName : r.qty + ' ' + (r.unit || 'each') }}
                                            @if (r.isStockItem) {
                                                <div class="muted" style="font-weight: 400">
                                                    {{ q(r.qtyBase, r.unit) }}
                                                </div>
                                            }
                                        </td>
                                        <td>
                                            {{ r.reasonLabel }}
                                            @if (r.note) {
                                                <div class="muted">“{{ r.note }}”</div>
                                            }
                                        </td>
                                        <td>
                                            @if (r.outcome === 'credit') {
                                                Credit note{{ r.creditNoteNo ? ' ' + r.creditNoteNo : ' (to come)' }}
                                            } @else {
                                                Replacement
                                            }
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                }

                @if (d.order; as o) {
                    @if (outstanding(d).length > 0) {
                        <div class="box">
                            <h2>Still to come on order no. {{ o.id }} - as of now</h2>
                            <table>
                                <tbody>
                                    @for (l of outstanding(d); track $index) {
                                        <tr>
                                            <td>{{ l.name }}</td>
                                            <td class="num total">{{ q(l.qtyOutstandingBase, l.unit) }}</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                            <div class="muted" style="font-size: 8.5pt">
                                As at {{ when(printedAt) }}. The order stays open until these arrive or
                                management voids them.
                            </div>
                        </div>
                    } @else {
                        <p class="muted">Nothing else is outstanding on order no. {{ o.id }}.</p>
                    }

                    @if (voided(d).length > 0) {
                        <div class="box">
                            <h2>Taken off the order</h2>
                            <table>
                                <tbody>
                                    @for (l of voided(d); track $index) {
                                        <tr>
                                            <td>{{ l.name }}</td>
                                            <td>{{ l.voidReason }}</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                }

                <div class="signs">
                    <div class="sign">
                        <div class="line"></div>
                        <div class="label">Received by (name, signature, date)</div>
                    </div>
                    <div class="sign">
                        <div class="line"></div>
                        <div class="label">
                            Delivered by - driver (name, signature){{
                                d.rejections.length > 0 ? ', and took back the goods above' : ''
                            }}
                        </div>
                    </div>
                </div>

                <div class="foot">
                    Printed {{ when(printedAt) }} by {{ printedBy() }} · The Grand Inventory
                </div>
            </div>
        } @else if (!error()) {
            <div class="sheet"><p>Loading…</p></div>
        }
    `
})
export class DeliveryPrintComponent implements OnInit {
    private api = inject(GrandService);
    private auth = inject(AuthStore);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    readonly grn = signal<GrnDetail | null>(null);
    readonly error = signal<string | null>(null);
    readonly printedAt = new Date().toISOString();

    branch(): string {
        return this.auth.location()?.name ?? '';
    }

    printedBy(): string {
        return this.auth.user()?.name ?? '';
    }

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;
        try {
            this.grn.set(await this.api.getGrn(id));
        } catch (err) {
            this.error.set(apiErrorMessage(err));
            return;
        }
        if (this.route.snapshot.queryParamMap.get('print') === '1') {
            // After the sheet has painted, or the dialog prints a blank page.
            setTimeout(() => window.print(), 400);
        }
    }


    print(): void {
        window.print();
    }

    /**
     * Print buttons open this in its own tab, so closing it goes back to where
     * they were. A browser that will not let a script close the tab gets the
     * Deliveries list instead of a dead button.
     */
    back(): void {
        window.close();
        setTimeout(() => void this.router.navigate(['/deliveries']), 300);
    }

    outstanding(d: GrnDetail) {
        return d.order?.lines.filter((l) => l.qtyOutstandingBase > 0) ?? [];
    }

    voided(d: GrnDetail) {
        return d.order?.lines.filter((l) => l.voided) ?? [];
    }

    q(qty: number, unit: string | null): string {
        return formatQty(qty, unit ?? '');
    }

    p(qty: number, a: GrnArrivalLine): string {
        return packsOrUnits(qty, a.unit, a.packName, a.packSize);
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
