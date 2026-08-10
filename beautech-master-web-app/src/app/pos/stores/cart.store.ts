/** Shopping cart store (FRONTEND_DOCUMENTATION.md §3.2). Not persisted by design. */
import { Injectable, signal, computed } from '@angular/core';
import { uuidv4 } from '../core/uuid';
import { computeCartTotals, applyBillDiscount } from '../core/money';
import type { BillDiscountSpec, CartLine, CartTotals, LocalCustomer, LocalProduct } from '../core/types';

@Injectable({ providedIn: 'root' })
export class CartStore {
    readonly lines = signal<CartLine[]>([]);
    readonly customer = signal<LocalCustomer | null>(null);
    readonly billDiscount = signal<BillDiscountSpec | null>(null);

    /** Lines with any bill-level discount proportionally folded into discountSnapshot. */
    readonly effectiveLines = computed<CartLine[]>(() => applyBillDiscount(this.lines(), this.billDiscount()));
    readonly totals = computed<CartTotals>(() => computeCartTotals(this.effectiveLines()));
    readonly count = computed(() => this.lines().reduce((sum, l) => sum + l.qty, 0));

    addProduct(product: LocalProduct, qty = 1): void {
        const lines = this.lines();
        const existing = lines.find(
            (l) =>
                l.productId === product.id &&
                l.unitPriceSnapshot === product.price &&
                l.taxRateSnapshot === product.tax_rate
        );

        if (existing) {
            this.lines.set(lines.map((l) => (l.lineId === existing.lineId ? { ...l, qty: l.qty + qty } : l)));
            return;
        }

        const hasDiscount = product.discount_type != null && product.discount_value != null;
        const gross = product.price * qty;
        const discountSnapshot = hasDiscount
            ? product.discount_type === 'PERCENT'
                ? Math.round(((gross * (product.discount_value as number)) / 100 + Number.EPSILON) * 100) / 100
                : Math.min(product.discount_value as number, gross)
            : 0;

        const line: CartLine = {
            lineId: uuidv4(),
            productId: product.id,
            sku: product.sku,
            name: product.name,
            qty,
            unitPriceSnapshot: product.price,
            taxRateSnapshot: product.tax_rate,
            discountSnapshot,
            discountType: product.discount_type,
            discountValue: product.discount_value,
            discountName: product.discount_name
        };
        this.lines.set([...lines, line]);
    }

    increment(lineId: string): void {
        this.lines.set(this.lines().map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + 1 } : l)));
    }

    decrement(lineId: string): void {
        this.lines.set(
            this.lines()
                .map((l) => (l.lineId === lineId ? { ...l, qty: l.qty - 1 } : l))
                .filter((l) => l.qty > 0)
        );
    }

    setQty(lineId: string, qty: number): void {
        this.lines.set(
            this.lines()
                .map((l) => (l.lineId === lineId ? { ...l, qty } : l))
                .filter((l) => l.qty > 0)
        );
    }

    setLineDiscount(lineId: string, amount: number): void {
        this.lines.set(
            this.lines().map((l) =>
                l.lineId === lineId
                    ? {
                          ...l,
                          discountSnapshot: Math.max(0, amount || 0),
                          discountType: null,
                          discountValue: null,
                          discountName: null
                      }
                    : l
            )
        );
    }

    removeLine(lineId: string): void {
        this.lines.set(this.lines().filter((l) => l.lineId !== lineId));
    }

    setCustomer(customer: LocalCustomer | null): void {
        this.customer.set(customer);
    }

    setBillDiscount(spec: BillDiscountSpec | null): void {
        this.billDiscount.set(spec);
    }

    clear(): void {
        this.lines.set([]);
        this.customer.set(null);
        this.billDiscount.set(null);
    }
}
