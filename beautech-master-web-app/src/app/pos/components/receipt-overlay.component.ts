/** Thermal (80mm) receipt overlay (FRONTEND_DOCUMENTATION.md §2.1 ReceiptOverlay). */
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { formatMoney } from '../core/money';
import { AuthStore } from '../stores/auth.store';
import type { CheckoutReceipt } from '../core/types';

@Component({
    selector: 'pos-receipt-overlay',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="receipt-mask" *ngIf="receipt">
            <div class="receipt-paper" id="pos-receipt">
                <div class="text-center mb-2">
                    <div class="receipt-logo" *ngIf="tenant()?.logo as logo">
                        <img [src]="logo" alt="logo" />
                    </div>
                    <div class="receipt-logo-initial" *ngIf="!tenant()?.logo">{{ shopInitial }}</div>
                    <h3 class="font-bold text-base">{{ tenant()?.shopName }}</h3>
                    <p class="text-xs" *ngIf="branch()?.name">{{ branch()?.name }}</p>
                    <p class="text-xs" *ngIf="branch()?.address">{{ branch()?.address }}</p>
                </div>
                <div class="receipt-divider"></div>
                <div class="text-xs flex justify-between"><span>Date</span><span>{{ receipt.transaction.created_at | date: 'short' }}</span></div>
                <div class="text-xs flex justify-between"><span>Receipt</span><span>#{{ receipt.transaction.id.slice(0, 8) }}</span></div>
                <div class="text-xs flex justify-between" *ngIf="cashierName"><span>Cashier</span><span>{{ cashierName }}</span></div>
                <div class="text-xs flex justify-between" *ngIf="receipt.transaction.customer_id"><span>Customer</span><span>{{ customerName }}</span></div>
                <div class="receipt-divider"></div>
                <table class="w-full text-xs">
                    <tbody>
                        <tr *ngFor="let li of receipt.lineItems">
                            <td class="py-0.5">{{ nameFor(li.product_id) }} ×{{ li.qty }}</td>
                            <td class="py-0.5 text-right">{{ money(li.line_total) }}</td>
                        </tr>
                    </tbody>
                </table>
                <div class="receipt-divider"></div>
                <div class="text-xs flex justify-between"><span>Subtotal</span><span>{{ money(receipt.transaction.subtotal) }}</span></div>
                <div class="text-xs flex justify-between" *ngIf="receipt.transaction.discount_total > 0"><span>Discount</span><span>-{{ money(receipt.transaction.discount_total) }}</span></div>
                <div class="text-xs flex justify-between"><span>Tax</span><span>{{ money(receipt.transaction.tax_total) }}</span></div>
                <div class="text-sm flex justify-between font-bold mt-1"><span>TOTAL</span><span>{{ money(receipt.transaction.total) }}</span></div>
                <div class="receipt-divider"></div>
                <div class="text-xs flex justify-between" *ngFor="let t of receipt.tenders">
                    <span>{{ t.method }}</span><span>{{ money(t.amount) }}</span>
                </div>
                <div class="text-xs flex justify-between" *ngIf="receipt.changeGiven > 0"><span>Change</span><span>{{ money(receipt.changeGiven) }}</span></div>
                <div class="receipt-divider"></div>
                <p class="text-center text-[10px] mt-2">Thank you for your purchase!</p>
            </div>
            <div class="receipt-actions">
                <button type="button" class="px-4 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" (click)="print()">Print</button>
                <button type="button" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast" (click)="close.emit()">Done</button>
            </div>
        </div>
    `,
    styles: [
        `
            .receipt-mask {
                position: fixed;
                inset: 0;
                z-index: 1200;
                background: rgba(0, 0, 0, 0.55);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 1rem;
                padding: 1rem;
                overflow: auto;
            }
            .receipt-paper {
                width: 80mm;
                max-width: 320px;
                background: #fff;
                color: #111;
                padding: 16px;
                border-radius: 6px;
                font-family: 'Courier New', monospace;
            }
            .receipt-divider {
                border-top: 1px dashed #999;
                margin: 6px 0;
            }
            .receipt-logo img {
                max-height: 48px;
                margin: 0 auto;
            }
            .receipt-logo-initial {
                width: 48px;
                height: 48px;
                line-height: 48px;
                margin: 0 auto;
                border-radius: 50%;
                background: #111;
                color: #fff;
                font-weight: 700;
                font-size: 20px;
            }
            .receipt-actions {
                display: flex;
                gap: 0.5rem;
            }
            @media print {
                .receipt-mask {
                    position: static;
                    background: #fff;
                    padding: 0;
                }
                .receipt-actions {
                    display: none;
                }
                :host {
                    position: static;
                }
            }
        `
    ]
})
export class ReceiptOverlayComponent {
    @Input() receipt!: CheckoutReceipt;
    /** Map of productId → display name for line items. */
    @Input() productNames: Record<string, string> = {};
    @Input() cashierName = '';
    @Input() customerName = '';
    @Output() close = new EventEmitter<void>();

    private auth = inject(AuthStore);
    tenant = this.auth.tenant;
    branch = this.auth.branch;

    get shopInitial(): string {
        return (this.tenant()?.shopName ?? '?').charAt(0).toUpperCase();
    }

    money(n: number): string {
        return formatMoney(n);
    }

    nameFor(productId: string): string {
        return this.productNames[productId] ?? productId.slice(0, 6);
    }

    print(): void {
        window.print();
    }
}
