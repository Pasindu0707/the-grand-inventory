/**
 * Checkout service: offline cash (Dexie) + online card / multi-tender.
 * Ported from FRONTEND_DOCUMENTATION.md §7.1.
 */
import { Injectable, inject } from '@angular/core';
import { db, applyLocalStockMovement } from '../core/pos-database';
import { uuidv4, newIdempotencyKey } from '../core/uuid';
import { computeCartTotals, lineTotal } from '../core/money';
import { SalesService } from './sales.service';
import { PaymentsService } from './payments.service';
import type {
    CartLine,
    CheckoutReceipt,
    LocalLineItem,
    LocalTransaction,
    OfflineTransactionPayload,
    PaymentMethod,
    PaymentStatus,
    Tender
} from '../core/types';

export class CheckoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CheckoutError';
    }
}

export interface CheckoutParams {
    lines: CartLine[];
    tenants: Tender[]; // alias kept for clarity
    tenders: Tender[];
    employeeId: string;
    tenantId: string;
    customerId: string | null;
}

const CASH_CAPABLE: PaymentMethod[] = ['CASH', 'GIFT_CARD', 'LOYALTY_POINTS'];

@Injectable({ providedIn: 'root' })
export class CheckoutService {
    private sales = inject(SalesService);
    private payments = inject(PaymentsService);

    /** Fully offline cash/equivalent checkout — writes directly to IndexedDB. */
    async checkoutCash(params: {
        lines: CartLine[];
        tenders: Tender[];
        employeeId: string;
        tenantId: string;
        customerId: string | null;
    }): Promise<CheckoutReceipt> {
        const { lines, tenders, employeeId, tenantId, customerId } = params;

        if (!lines.length) throw new CheckoutError('Cart is empty');
        const totals = computeCartTotals(lines);
        const tendered = tenders.reduce((sum, t) => sum + t.amount, 0);
        if (tendered + 1e-9 < totals.total) throw new CheckoutError('Insufficient payment to cover total');

        const cashTender = tenders.find((t) => t.method === 'CASH');
        const cashReceived = cashTender?.cashReceived ?? null;
        const changeGiven = cashReceived != null ? Math.max(0, Number((tendered - totals.total).toFixed(2))) : 0;

        const txId = uuidv4();
        const now = new Date().toISOString();
        const idempotencyKey = newIdempotencyKey();
        const primaryMethod = tenders[0]?.method ?? 'CASH';

        const transaction: LocalTransaction = {
            id: txId,
            employee_id: employeeId,
            customer_id: customerId,
            subtotal: totals.subtotal,
            tax_total: totals.taxTotal,
            discount_total: totals.discountTotal,
            total: totals.total,
            status: 'COMPLETED',
            payment_status: 'PAID' as PaymentStatus,
            payment_method: primaryMethod,
            cash_received: cashReceived,
            change_given: changeGiven,
            idempotency_key: idempotencyKey,
            created_at: now,
            synced: 0,
            tenant_id: tenantId
        };

        const lineItems: LocalLineItem[] = lines.map((l) => ({
            id: uuidv4(),
            transaction_id: txId,
            product_id: l.productId,
            qty: l.qty,
            unit_price_snapshot: l.unitPriceSnapshot,
            tax_rate_snapshot: l.taxRateSnapshot,
            discount_snapshot: l.discountSnapshot,
            line_total: lineTotal(l)
        }));

        const payload: OfflineTransactionPayload = {
            id: txId,
            clientCreatedAt: now,
            idempotencyKey,
            customerId: customerId ?? undefined,
            items: lines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unitPriceSnapshot: l.unitPriceSnapshot,
                taxRateSnapshot: l.taxRateSnapshot,
                discount: l.discountSnapshot
            })),
            payment: {
                method: primaryMethod,
                cashReceived: cashReceived ?? undefined
            }
        };

        await db.transaction(
            'rw',
            db.local_transactions,
            db.local_line_items,
            db.sync_queue,
            db.products,
            async () => {
                await db.local_transactions.add(transaction);
                await db.local_line_items.bulkAdd(lineItems);
                await db.sync_queue.add({
                    id: uuidv4(),
                    payload_type: 'TRANSACTION',
                    payload: JSON.stringify(payload),
                    status: 'PENDING',
                    retry_count: 0,
                    created_at: now
                });
            }
        );

        // Optimistic local stock decrement
        await applyLocalStockMovement(lines.map((l) => ({ product_id: l.productId, qty: l.qty })));

        return { transaction, lineItems, tenders, changeGiven };
    }

    /** Online card checkout via Stripe Terminal. */
    async checkoutCard(params: {
        lines: CartLine[];
        employeeId: string;
        tenantId: string;
        customerId: string | null;
    }): Promise<CheckoutReceipt> {
        const totals = computeCartTotals(params.lines);
        const intent = await this.payments.runCardPaymentFlow(totals.total);
        const tenders: Tender[] = [
            { method: 'STRIPE_TERMINAL', amount: totals.total, stripePaymentIntentId: intent.id }
        ];
        return this.finalizeOnline(params, tenders);
    }

    /** Online multi-tender checkout. */
    async checkoutTender(params: {
        lines: CartLine[];
        tenders: Tender[];
        employeeId: string;
        tenantId: string;
        customerId: string | null;
    }): Promise<CheckoutReceipt> {
        return this.finalizeOnline(params, params.tenders);
    }

    private async finalizeOnline(
        params: { lines: CartLine[]; employeeId: string; tenantId: string; customerId: string | null },
        tenders: Tender[]
    ): Promise<CheckoutReceipt> {
        const totals = computeCartTotals(params.lines);
        const server = await this.sales.checkoutOnline({
            lines: params.lines,
            employeeId: params.employeeId,
            tenantId: params.tenantId,
            customerId: params.customerId,
            tenders
        });

        const now = server.createdAt ?? new Date().toISOString();
        const txId = server.id ?? uuidv4();
        const transaction: LocalTransaction = {
            id: txId,
            employee_id: params.employeeId,
            customer_id: params.customerId,
            subtotal: totals.subtotal,
            tax_total: totals.taxTotal,
            discount_total: totals.discountTotal,
            total: totals.total,
            status: 'COMPLETED',
            payment_status: 'PAID',
            payment_method: tenders[0]?.method ?? 'VISA',
            cash_received: tenders.find((t) => t.method === 'CASH')?.cashReceived ?? null,
            change_given: 0,
            idempotency_key: newIdempotencyKey(),
            created_at: now,
            synced: 1,
            tenant_id: params.tenantId
        };
        const lineItems: LocalLineItem[] = params.lines.map((l) => ({
            id: uuidv4(),
            transaction_id: txId,
            product_id: l.productId,
            qty: l.qty,
            unit_price_snapshot: l.unitPriceSnapshot,
            tax_rate_snapshot: l.taxRateSnapshot,
            discount_snapshot: l.discountSnapshot,
            line_total: lineTotal(l)
        }));
        const tendered = tenders.reduce((s, t) => s + t.amount, 0);
        return { transaction, lineItems, tenders, changeGiven: Math.max(0, Number((tendered - totals.total).toFixed(2))) };
    }

    /** Whether all tenders can be settled offline (cash-capable). */
    static allOffline(tenders: Tender[]): boolean {
        return tenders.length > 0 && tenders.every((t) => CASH_CAPABLE.includes(t.method));
    }
}
