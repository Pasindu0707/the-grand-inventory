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

/**
 * A stock-unit quantity in the pack it was ordered in, where it divides evenly:
 * "3 × 2.5 kg box". Falls back to plain units ("7.5 kg") when it does not, or
 * for a product ordered by name ("1 unit").
 */
export function packsOrUnits(
    qtyBase: number,
    unit: string | null,
    packName: string | null,
    packSize: number | null
): string {
    if (packName && packSize && packSize > 0) {
        const packs = qtyBase / packSize;
        if (Math.abs(packs - Math.round(packs)) < 0.001) return `${trim(Math.round(packs))} × ${packName}`;
    }
    return formatQty(qtyBase, unit || 'each');
}

/** "2 x 20 L can" - how a delivery is actually described. */
export function describePacks(qtyPacks: number, packName: string): string {
    return `${trim(qtyPacks)} × ${packName}`;
}
