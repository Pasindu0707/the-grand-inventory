/**
 * Cent-safe money arithmetic + currency formatting.
 * Ported from FRONTEND_DOCUMENTATION.md §7.2 (money.ts).
 */
import type { CartLine, CartTotals, BillDiscountSpec, DiscountType } from './types';

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineGross(line: CartLine): number {
    return round2(line.unitPriceSnapshot * line.qty);
}

export function lineTaxable(line: CartLine): number {
    return Math.max(0, round2(lineGross(line) - line.discountSnapshot));
}

export function lineTax(line: CartLine): number {
    return round2(lineTaxable(line) * line.taxRateSnapshot);
}

export function lineTotal(line: CartLine): number {
    return round2(lineTaxable(line) + lineTax(line));
}

export function computeDiscountAmount(type: DiscountType, value: number, gross: number): number {
    if (type === 'PERCENT') {
        return round2((gross * value) / 100);
    }
    // FIXED
    return Math.min(value, gross);
}

/**
 * Proportionally distribute a bill-level discount across lines (by gross weight).
 * Returns a new array of lines with the bill discount folded into discountSnapshot.
 */
export function applyBillDiscount(lines: CartLine[], spec: BillDiscountSpec | null): CartLine[] {
    if (!spec || lines.length === 0) return lines;

    const grossTotal = round2(lines.reduce((sum, l) => sum + lineGross(l), 0));
    if (grossTotal <= 0) return lines;

    const billDiscount = computeDiscountAmount(spec.type, spec.value, grossTotal);

    let allocated = 0;
    return lines.map((line, idx) => {
        const gross = lineGross(line);
        let share: number;
        if (idx === lines.length - 1) {
            share = round2(billDiscount - allocated); // remainder to avoid rounding drift
        } else {
            share = round2((gross / grossTotal) * billDiscount);
            allocated = round2(allocated + share);
        }
        return { ...line, discountSnapshot: round2(line.discountSnapshot + share) };
    });
}

export function computeCartTotals(lines: CartLine[]): CartTotals {
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    let total = 0;

    for (const line of lines) {
        subtotal = round2(subtotal + lineGross(line));
        discountTotal = round2(discountTotal + line.discountSnapshot);
        taxTotal = round2(taxTotal + lineTax(line));
        total = round2(total + lineTotal(line));
    }

    return { subtotal, taxTotal, discountTotal, total };
}

// ── Currency formatting ─────────────────────────────────────────────────────
let activeCurrency = 'USD';

export function setActiveCurrency(code: string): void {
    if (code) activeCurrency = code;
}

export function getActiveCurrency(): string {
    return activeCurrency;
}

export function formatMoney(amount: number): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: activeCurrency
        }).format(amount ?? 0);
    } catch {
        return `${activeCurrency} ${(amount ?? 0).toFixed(2)}`;
    }
}
