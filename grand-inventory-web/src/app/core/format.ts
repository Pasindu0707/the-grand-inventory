/**
 * Formatting helpers.
 *
 * This system counts stock and keeps no prices (migration 0009), so there is
 * no currency formatting here. What it genuinely needs is turning stock units
 * into something a human reads.
 */

/**
 * Stock is stored in the small unit (g, ml, ea) because that is the only way
 * the arithmetic stays exact. Nobody wants to read "47500 g", so display
 * scales up - display only. Nothing round-trips through this.
 */
export function formatQty(qtyBase: number, stockUnit: string): string {
    const qty = qtyBase ?? 0;

    if (stockUnit === 'g' && Math.abs(qty) >= 1000) {
        return `${trim(qty / 1000)} kg`;
    }
    if (stockUnit === 'ml' && Math.abs(qty) >= 1000) {
        return `${trim(qty / 1000)} L`;
    }
    return `${trim(qty)} ${stockUnit}`;
}

function trim(n: number): string {
    return n.toLocaleString('en-LK', { maximumFractionDigits: 2 });
}

/** "2 x 20 L can" - how a delivery is actually described. */
export function describePacks(qtyPacks: number, packName: string): string {
    return `${trim(qtyPacks)} × ${packName}`;
}
