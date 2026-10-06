/**
 * What each supplier delivers.
 *
 * The list a purchase order is built from: pick the supplier, and what they
 * bring is what is offered. The admin keeps it on the Suppliers screen; an
 * order adds to it whenever it includes something that was not on it yet,
 * because a supplier you have just ordered it from evidently delivers it.
 *
 * An entry is either an item from the item master or a product typed in by
 * name. Named products can be ordered but are not stock -- see 0010.
 */
import { db } from '../db/index.js';
import { badRequest, notFound } from '../errors.js';
import type { Tx } from './ledger.js';

/** One thing a supplier delivers, as an order or the admin screen needs it. */
export interface SupplierItem {
    id: number;
    itemId: number | null;
    /** The item's name, or the product's typed name. */
    name: string;
    code: string | null;
    /** The item's stock unit, or what a named product is counted in. */
    unit: string | null;
}

/** An entry to add: an item from the item master, or a product by name. */
export type SupplierItemEntry = { itemId: number } | { name: string; unit?: string | null };

export async function listSupplierItems(supplierId: number): Promise<SupplierItem[]> {
    const rows = await db
        .selectFrom('supplier_items as si')
        .leftJoin('items', 'items.id', 'si.item_id')
        .select([
            'si.id',
            'si.item_id as itemId',
            'si.name as typedName',
            'si.unit as typedUnit',
            'items.name as itemName',
            'items.code',
            'items.stock_unit as stockUnit',
            'items.is_active as itemActive'
        ])
        .where('si.supplier_id', '=', supplierId)
        .execute();

    return (
        rows
            // A retired item cannot be ordered, so it is not offered. The row
            // stays: bring the item back and the supplier still has it.
            .filter((r) => r.itemId === null || r.itemActive)
            .map((r) => ({
                id: r.id,
                itemId: r.itemId,
                name: (r.itemName ?? r.typedName)!,
                code: r.code,
                unit: r.itemId === null ? r.typedUnit : r.stockUnit
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
    );
}

/**
 * Add to a supplier's list, skipping anything already on it.
 *
 * Used inside the transaction that raises an order, so the order and the
 * supplier's list change together or not at all.
 */
export async function rememberSupplierItems(
    trx: Tx,
    supplierId: number,
    entries: SupplierItemEntry[],
    userId: number
): Promise<void> {
    for (const entry of entries) {
        await trx
            .insertInto('supplier_items')
            .values(
                'itemId' in entry
                    ? { supplier_id: supplierId, item_id: entry.itemId, added_by: userId }
                    : {
                          supplier_id: supplierId,
                          name: entry.name.trim(),
                          unit: entry.unit?.trim() || null,
                          added_by: userId
                      }
            )
            // Either partial unique index -- same item, or same name ignoring
            // case -- means it is already on the list, which is the goal.
            .onConflict((oc) => oc.doNothing())
            .execute();
    }
}

/**
 * Set a supplier's list to exactly these entries.
 *
 * The admin screen edits the whole list and saves it at once, the same way the
 * rest of the supplier's details are saved. Removing an entry only stops it
 * being offered; orders already raised keep their lines.
 */
export async function replaceSupplierItems(
    trx: Tx,
    supplierId: number,
    entries: SupplierItemEntry[],
    userId: number
): Promise<void> {
    const supplier = await trx
        .selectFrom('suppliers')
        .select('id')
        .where('id', '=', supplierId)
        .executeTakeFirst();
    if (!supplier) throw notFound('That supplier');

    const itemIds = entries.flatMap((e) => ('itemId' in e ? [e.itemId] : []));
    if (itemIds.length > 0) {
        const found = await trx
            .selectFrom('items')
            .select('id')
            .where('id', 'in', itemIds)
            .execute();
        if (found.length !== new Set(itemIds).size) throw badRequest('One of those items does not exist');
    }

    const names = entries.flatMap((e) => ('name' in e ? [e.name.trim().toLowerCase()] : []));

    let del = trx.deleteFrom('supplier_items').where('supplier_id', '=', supplierId);
    // Keep what is staying, so its added_by / added_at survive the save. Each
    // branch tests its own column for null first: `null in (...)` is null, and
    // NOT null would keep a named product the admin had just taken off.
    if (itemIds.length > 0 || names.length > 0) {
        del = del.where((eb) =>
            eb.not(
                eb.or([
                    ...(itemIds.length > 0
                        ? [eb.and([eb('item_id', 'is not', null), eb('item_id', 'in', itemIds)])]
                        : []),
                    ...(names.length > 0
                        ? [eb.and([eb('item_id', 'is', null), eb(eb.fn('lower', ['name']), 'in', names)])]
                        : [])
                ])
            )
        );
    }
    await del.execute();

    await rememberSupplierItems(trx, supplierId, entries, userId);
}
