/**
 * Goods received note: a supplier delivery with an invoice.
 *
 * The one conversion rule the whole system rests on lives here. Users enter
 * *packs* -- "2 x 20 L can" -- because that is what arrives on the lorry and
 * what the invoice says. The pack is converted to stock units exactly once, at
 * entry, and everything downstream is in stock units. If grams ever reach a
 * field a human types into, something has gone wrong.
 *
 * A delivery against an order can also tick off products that were ordered by
 * name (0010). Those are recorded on the delivery and against the order, but
 * they are not stock and never reach the ledger.
 *
 * And it can refuse goods at the door (0012): packs that came bad go back on
 * the same lorry, never enter stock, and say what the supplier owes for them --
 * a replacement, which the order keeps waiting for, or a credit note, which
 * takes them off it. A delivery that came with refusals, that leaves its order
 * with something still to come, or that brought more than was owed, is
 * flagged for management to read.
 *
 * Every delivery against an order also records, line by line, what was still
 * owed when it arrived (0015). The order itself only knows where things stand
 * now; this is what lets a delivery be read back as it was on the day.
 */
import { db } from '../db/index.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { sql } from 'kysely';
import { audit, businessDateFor, postDocument, type LedgerLine, type Tx } from './ledger.js';
import { claimKey, storeResponse } from './idempotency.js';
import { applyReceiptToPo } from './purchasing.js';

export interface GrnLineInput {
    itemPackId: number;
    qtyPacks: number;
    expiryDate?: string | null;
}

export interface CreateGrnInput {
    locationId: number;
    supplierId: number;
    /**
     * The order this delivery is against, if it was ordered rather than simply
     * turning up. Booking it here rather than through a separate "receive"
     * endpoint keeps one code path for stock arriving: the order is told what
     * came in the same transaction that moves the ledger, so a delivery can
     * never be recorded while the order it fills stays open.
     */
    poId?: string | null;
    invoiceNo?: string | null;
    invoiceDate?: string | null;
    photoUrl?: string | null;
    lines: GrnLineInput[];
    /** Products ordered by name that arrived, by their order line. Needs a poId. */
    otherLines?: { poLineId: string; qty: number }[];
    /** Refused at the door and sent back on the lorry. Needs a poId. */
    rejections?: GrnRejectionInput[];
    receivedBy: number;
    idempotency: { key: string; endpoint: string; requestHash: string };
}

export interface GrnRejectionInput {
    poLineId: string;
    /** Packs of a stock item, or the plain count of a product ordered by name. */
    qty: number;
    reasonCode: string;
    note?: string | null;
    outcome: 'replacement' | 'credit';
}

export interface CreateGrnResult {
    id: string;
    businessDate: string;
    lineCount: number;
    /** Something was refused, or is still to come: management gets a report. */
    needsReview: boolean;
}

export async function createGrn(input: CreateGrnInput): Promise<CreateGrnResult> {
    const otherLines = input.otherLines ?? [];
    const rejections = input.rejections ?? [];
    if (input.lines.length === 0 && otherLines.length === 0 && rejections.length === 0) {
        throw badRequest('A GRN needs at least one line');
    }
    if (otherLines.length > 0 && !input.poId) {
        throw badRequest('Products ordered by name can only be received against their order');
    }
    if (rejections.length > 0 && !input.poId) {
        throw badRequest('Goods can only be sent back at the door against the order they came on');
    }
    if (rejections.length > 0) {
        const codes = [...new Set(rejections.map((r) => r.reasonCode))];
        const known = await db
            .selectFrom('reason_codes')
            .select('code')
            .where('code', 'in', codes)
            .where('doc', '=', 'return')
            .execute();
        if (known.length !== codes.length) throw badRequest('Pick a reason for each item going back');
    }
    for (const o of otherLines) {
        if (o.qty <= 0) throw badRequest('Quantity must be more than zero');
    }

    const packIds = input.lines.map((l) => l.itemPackId);

    const packs = packIds.length === 0 ? [] : await db
        .selectFrom('item_packs')
        .innerJoin('items', 'items.id', 'item_packs.item_id')
        .select([
            'item_packs.id as pack_id',
            'item_packs.item_id',
            'item_packs.pack_name',
            'item_packs.qty_in_stock_unit',
            'items.name as item_name',
            'items.stock_unit',
        ])
        .where('item_packs.id', 'in', packIds)
        .execute();

    const byPack = new Map(packs.map((p) => [p.pack_id, p]));
    for (const id of packIds) {
        if (!byPack.has(id)) throw notFound(`Item pack ${id}`);
    }

    const supplier = await db
        .selectFrom('suppliers')
        .select(['id', 'name'])
        .where('id', '=', input.supplierId)
        .where('is_active', '=', true)
        .executeTakeFirst();
    if (!supplier) throw notFound(`Supplier ${input.supplierId}`);

    const store = await db
        .selectFrom('sections')
        .select('id')
        .where('location_id', '=', input.locationId)
        .where('is_store', '=', true)
        .executeTakeFirst();
    if (!store) throw badRequest('This location has no main store section');

    // Deliveries land in the store, and the store is just another section --
    // which is what keeps every movement a section-to-section transfer.
    const storeSectionId = store.id;

    return db.transaction().execute(async (trx) => {
        await claimKey(
            trx,
            input.idempotency.key,
            input.idempotency.endpoint,
            input.idempotency.requestHash,
            input.receivedBy
        );

        const businessDate = await businessDateFor(trx, input.locationId);

        const grn = await trx
            .insertInto('grn')
            .values({
                location_id: input.locationId,
                supplier_id: input.supplierId,
                invoice_no: input.invoiceNo ?? null,
                invoice_date: input.invoiceDate ?? null,
                received_by: input.receivedBy,
                photo_url: input.photoUrl ?? null,
                po_id: input.poId ?? null,
                is_demo: false,
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        // What the order still wanted before this lorry: read before any
        // refusal below takes a credit off it.
        const owedBefore = input.poId ? await owedOnOrder(trx, input.poId) : [];

        const ledgerLines: LedgerLine[] = [];

        for (const [i, line] of input.lines.entries()) {
            const pack = byPack.get(line.itemPackId)!;

            if (line.qtyPacks <= 0) {
                throw badRequest(`${pack.item_name}: quantity must be more than zero`);
            }

            await trx
                .insertInto('grn_lines')
                .values({
                    grn_id: grn.id,
                    item_pack_id: line.itemPackId,
                    qty_packs: line.qtyPacks,
                    expiry_date: line.expiryDate ?? null,
                    is_demo: false,
                })
                .execute();

            // The conversion. Packs in, stock units from here on.
            const qtyBase = line.qtyPacks * pack.qty_in_stock_unit;

            ledgerLines.push({
                sectionId: storeSectionId,
                itemId: pack.item_id,
                qtyBase,
                docLine: i + 1,
            });
        }

        for (const o of otherLines) {
            const poLine = await trx
                .selectFrom('purchase_order_lines')
                .select(['description', 'unit'])
                .where('id', '=', o.poLineId)
                .where('po_id', '=', input.poId!)
                .where('item_id', 'is', null)
                .executeTakeFirst();
            if (!poLine) throw badRequest('That product is not on this order');

            await trx
                .insertInto('grn_other_lines')
                .values({
                    grn_id: grn.id,
                    po_line_id: o.poLineId,
                    description: poLine.description!,
                    unit: poLine.unit,
                    qty: o.qty,
                    is_demo: false,
                })
                .execute();
        }

        const refused = new Map<string, { qty: number; credited: number }>();
        for (const r of rejections) {
            const done = await recordRejection(trx, String(grn.id), input.poId!, r);
            const sum = refused.get(r.poLineId) ?? { qty: 0, credited: 0 };
            sum.qty += done.qtyBase;
            if (r.outcome === 'credit') sum.credited += done.qtyBase;
            refused.set(r.poLineId, sum);
        }

        let taken = new Map<string, number>();
        if (input.poId) {
            taken = await applyReceiptToPo(
                trx,
                input.poId,
                input.locationId,
                input.supplierId,
                input.receivedBy,
                ledgerLines.map((l) => ({ itemId: l.itemId, qtyBase: l.qtyBase })),
                otherLines
            );
        }

        // Nothing to post when only products ordered by name came: they are
        // not stock.
        if (ledgerLines.length > 0) {
            await postDocument(trx, {
                doc: 'grn',
                docId: grn.id,
                locationId: input.locationId,
                businessDate,
                lines: ledgerLines,
                createdBy: input.receivedBy,
            });
        }

        // The record of the day, one row per order line this delivery found
        // owing or touched. Over is whatever came off the lorry, good or bad,
        // beyond what was owed: a credited box sent again lands here.
        let anyOver = false;
        for (const l of owedBefore) {
            const received = taken.get(l.id) ?? 0;
            const back = refused.get(l.id) ?? { qty: 0, credited: 0 };
            if (l.owed <= 0 && received <= 0 && back.qty <= 0) continue;
            const over = Math.max(0, round3(received + back.qty - l.owed));
            if (over > 0) anyOver = true;
            await trx
                .insertInto('grn_order_lines')
                .values({
                    grn_id: grn.id,
                    po_line_id: l.id,
                    qty_ordered_base: l.ordered,
                    qty_owed_before_base: l.owed,
                    qty_received_base: round3(received),
                    qty_refused_base: round3(back.qty),
                    qty_credited_base: round3(back.credited),
                    qty_over_base: over,
                    is_demo: false,
                })
                .execute();
        }

        // Stock items that came on an order delivery but are not on the order
        // at all. They are received -- they are here -- but nobody asked.
        const orderedItems = new Set(owedBefore.map((l) => l.itemId).filter((x) => x !== null));
        const notOnOrder = input.poId
            ? ledgerLines.some((l) => !orderedItems.has(l.itemId))
            : false;

        // Management reads any delivery that came with refusals, left its order
        // short, or brought more than was asked for. A clean, complete one is
        // not news.
        let needsReview = rejections.length > 0 || anyOver || notOnOrder;
        if (input.poId && !needsReview) {
            const open = await trx
                .selectFrom('purchase_order_lines')
                .select('id')
                .where('po_id', '=', input.poId)
                .where('voided_at', 'is', null)
                .where(
                    sql<boolean>`qty_base > qty_received_base + qty_credited_base + 0.0005`
                )
                .limit(1)
                .executeTakeFirst();
            needsReview = !!open;
        }
        if (needsReview) {
            await trx
                .updateTable('grn')
                .set({ needs_review: true })
                .where('id', '=', grn.id)
                .execute();
        }

        await audit(trx, {
            userId: input.receivedBy,
            action: 'grn.create',
            entity: 'grn',
            entityId: grn.id,
            after: {
                supplierId: input.supplierId,
                lineCount: input.lines.length + otherLines.length,
                rejections: rejections.length,
                poId: input.poId ?? null,
            },
        });

        const result: CreateGrnResult = {
            id: String(grn.id),
            businessDate,
            lineCount: input.lines.length + otherLines.length,
            needsReview,
        };

        await storeResponse(trx, input.idempotency.key, result, 201);
        return result;
    });
}

/**
 * One line refused at the door.
 *
 * Measured against what was still owed on that order line before this
 * delivery: refusing more than the supplier owed is a typo, not a return. A
 * credit takes the quantity off the order there and then; a replacement leaves
 * it outstanding, which it already is, because nothing was received.
 */
async function recordRejection(
    trx: Tx,
    grnId: string,
    poId: string,
    r: GrnRejectionInput
): Promise<{ qtyBase: number }> {
    if (!(r.qty > 0)) throw badRequest('The number going back must be more than zero');

    const line = await trx
        .selectFrom('purchase_order_lines as l')
        .leftJoin('item_packs as p', 'p.id', 'l.item_pack_id')
        .leftJoin('items as i', 'i.id', 'l.item_id')
        .select([
            'l.id',
            'l.item_id',
            'l.item_pack_id',
            'l.description',
            'l.unit',
            'l.qty_base',
            'l.qty_received_base',
            'l.qty_credited_base',
            'l.voided_at',
            'p.qty_in_stock_unit',
            'i.name as itemName',
        ])
        .where('l.id', '=', r.poLineId)
        .where('l.po_id', '=', poId)
        .executeTakeFirst();
    if (!line) throw badRequest('That item is not on this order');
    const name = line.itemName ?? line.description ?? 'That item';
    if (line.voided_at) throw conflict(`${name} was taken off the order`);

    const isItem = line.item_id !== null;
    if (isItem && line.qty_in_stock_unit === null) {
        throw badRequest(`${name} was ordered without a pack, so it cannot be counted back`);
    }
    const qtyBase = isItem ? r.qty * Number(line.qty_in_stock_unit) : r.qty;

    const owed =
        Number(line.qty_base) - Number(line.qty_received_base) - Number(line.qty_credited_base);
    if (qtyBase > owed + 0.0005) {
        throw badRequest(`${name}: more is going back than was still owed on the order`);
    }

    await trx
        .insertInto('grn_rejections')
        .values({
            grn_id: grnId,
            po_line_id: r.poLineId,
            item_id: line.item_id,
            item_pack_id: isItem ? line.item_pack_id : null,
            description: isItem ? null : line.description,
            unit: isItem ? null : line.unit,
            qty_packs: r.qty,
            qty_base: Math.round(qtyBase * 1000) / 1000,
            reason_code: r.reasonCode,
            note: r.note?.trim() || null,
            outcome: r.outcome,
            is_demo: false,
        })
        .execute();

    if (r.outcome === 'credit') {
        await trx
            .updateTable('purchase_order_lines')
            .set({
                qty_credited_base: Math.round((Number(line.qty_credited_base) + qtyBase) * 1000) / 1000,
            })
            .where('id', '=', line.id)
            .execute();
    }

    return { qtyBase: Math.round(qtyBase * 1000) / 1000 };
}

/** Every live line of an order, and how much of it is still owed right now. */
async function owedOnOrder(trx: Tx, poId: string) {
    const lines = await trx
        .selectFrom('purchase_order_lines')
        .select(['id', 'item_id', 'qty_base', 'qty_received_base', 'qty_credited_base'])
        .where('po_id', '=', poId)
        .where('voided_at', 'is', null)
        .orderBy('id')
        .execute();
    return lines.map((l) => ({
        id: String(l.id),
        itemId: l.item_id,
        ordered: Number(l.qty_base),
        owed: Math.max(
            0,
            round3(Number(l.qty_base) - Number(l.qty_received_base) - Number(l.qty_credited_base))
        ),
    }));
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}
