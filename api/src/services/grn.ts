/**
 * Goods received note: a supplier delivery with an invoice.
 *
 * The one conversion rule the whole system rests on lives here. Users enter
 * *packs* -- "2 x 20 L can" -- because that is what arrives on the lorry and
 * what the invoice says. The pack is converted to stock units exactly once, at
 * entry, and everything downstream is in stock units. If grams ever reach a
 * field a human types into, something has gone wrong.
 */
import { db } from '../db/index.js';
import { badRequest, notFound } from '../errors.js';
import { audit, businessDateFor, postDocument, type LedgerLine } from './ledger.js';
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
    receivedBy: number;
    idempotency: { key: string; endpoint: string; requestHash: string };
}

export interface CreateGrnResult {
    id: string;
    businessDate: string;
    lineCount: number;
}

export async function createGrn(input: CreateGrnInput): Promise<CreateGrnResult> {
    if (input.lines.length === 0) throw badRequest('A GRN needs at least one line');

    const packIds = input.lines.map((l) => l.itemPackId);

    const packs = await db
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

        if (input.poId) {
            await applyReceiptToPo(
                trx,
                input.poId,
                input.locationId,
                input.supplierId,
                input.receivedBy,
                ledgerLines.map((l) => ({ itemId: l.itemId, qtyBase: l.qtyBase }))
            );
        }

        await postDocument(trx, {
            doc: 'grn',
            docId: grn.id,
            locationId: input.locationId,
            businessDate,
            lines: ledgerLines,
            createdBy: input.receivedBy,
        });

        await audit(trx, {
            userId: input.receivedBy,
            action: 'grn.create',
            entity: 'grn',
            entityId: grn.id,
            after: {
                supplierId: input.supplierId,
                lineCount: input.lines.length,
                poId: input.poId ?? null,
            },
        });

        const result: CreateGrnResult = {
            id: String(grn.id),
            businessDate,
            lineCount: input.lines.length,
        };

        await storeResponse(trx, input.idempotency.key, result, 201);
        return result;
    });
}
