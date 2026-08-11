/**
 * Market purchase: a cash buy at the fish market or the pola.
 *
 * There is no invoice. Nobody at Negombo Fish Market issues one. The photo of
 * the handwritten slip is the only evidence that exists that the money bought
 * anything, so it is required *here*, in the service, not merely in the form.
 * A rule enforced only in a UI is a rule that survives until the first person
 * with a REST client.
 *
 * Lines are entered in stock units with a total price, not packs: you buy
 * "3.2 kg of prawns for Rs 6,400", and there is no pack. Unit cost is derived,
 * which is what feeds the weighted average.
 */
import { db } from '../db/index.js';
import { badRequest, notFound } from '../errors.js';
import { audit, businessDateFor, postDocument, type LedgerLine } from './ledger.js';
import { claimKey, storeResponse } from './idempotency.js';

export interface MarketLineInput {
    itemId: number;
    /** In the item's stock_unit — grams, millilitres, each. */
    qtyBase: number;
    /** What was paid for that quantity, in total. */
    totalPrice: number;
}

export interface CreateMarketInput {
    locationId: number;
    supplierId?: number | null;
    photoUrl: string;
    cashGiven?: number | null;
    cashReturned?: number | null;
    lines: MarketLineInput[];
    boughtBy: number;
    idempotency: { key: string; endpoint: string; requestHash: string };
}

export interface CreateMarketResult {
    id: string;
    total: number;
    businessDate: string;
    lineCount: number;
    /** Set when the cash handed over does not reconcile with what was spent. */
    cashDiscrepancy: number | null;
}

export async function createMarketPurchase(
    input: CreateMarketInput
): Promise<CreateMarketResult> {
    if (input.lines.length === 0) throw badRequest('A market purchase needs at least one line');

    if (!input.photoUrl || !input.photoUrl.trim()) {
        throw badRequest(
            'A photo of the slip is required for a cash purchase — it is the only record of the money'
        );
    }

    const itemIds = input.lines.map((l) => l.itemId);
    const items = await db
        .selectFrom('items')
        .select(['id', 'name'])
        .where('id', 'in', itemIds)
        .where('is_active', '=', true)
        .execute();

    const byId = new Map(items.map((i) => [i.id, i]));
    for (const id of itemIds) {
        if (!byId.has(id)) throw notFound(`Item ${id}`);
    }

    if (input.supplierId) {
        const supplier = await db
            .selectFrom('suppliers')
            .select('id')
            .where('id', '=', input.supplierId)
            .executeTakeFirst();
        if (!supplier) throw notFound(`Supplier ${input.supplierId}`);
    }

    const store = await db
        .selectFrom('sections')
        .select('id')
        .where('location_id', '=', input.locationId)
        .where('is_store', '=', true)
        .executeTakeFirst();
    if (!store) throw badRequest('This location has no main store section');

    return db.transaction().execute(async (trx) => {
        await claimKey(
            trx,
            input.idempotency.key,
            input.idempotency.endpoint,
            input.idempotency.requestHash,
            input.boughtBy
        );

        const businessDate = await businessDateFor(trx, input.locationId);
        const total = input.lines.reduce((sum, l) => sum + l.totalPrice, 0);

        const purchase = await trx
            .insertInto('market_purchase')
            .values({
                location_id: input.locationId,
                supplier_id: input.supplierId ?? null,
                bought_by: input.boughtBy,
                cash_given: input.cashGiven ?? null,
                cash_returned: input.cashReturned ?? null,
                photo_url: input.photoUrl,
                is_demo: false
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const ledgerLines: LedgerLine[] = [];

        for (const [i, line] of input.lines.entries()) {
            const item = byId.get(line.itemId)!;
            if (line.qtyBase <= 0) throw badRequest(`${item.name}: quantity must be more than zero`);
            if (line.totalPrice < 0) throw badRequest(`${item.name}: price cannot be negative`);

            await trx
                .insertInto('market_purchase_lines')
                .values({
                    market_id: purchase.id,
                    item_id: line.itemId,
                    qty_base: line.qtyBase,
                    total_price: line.totalPrice,
                    is_demo: false
                })
                .execute();

            ledgerLines.push({
                sectionId: store.id,
                itemId: line.itemId,
                qtyBase: line.qtyBase,
                unitCost: line.totalPrice / line.qtyBase,
                docLine: i + 1
            });
        }

        await postDocument(trx, {
            doc: 'market',
            docId: purchase.id,
            locationId: input.locationId,
            businessDate,
            lines: ledgerLines,
            createdBy: input.boughtBy
        });

        // Cash out minus change back should equal what was spent. A gap is not
        // an error -- prices get rounded at a market stall -- but somebody
        // should see it.
        let cashDiscrepancy: number | null = null;
        if (input.cashGiven != null) {
            const spent = input.cashGiven - (input.cashReturned ?? 0);
            const gap = Math.round((spent - total) * 100) / 100;
            if (Math.abs(gap) >= 1) cashDiscrepancy = gap;
        }

        await audit(trx, {
            userId: input.boughtBy,
            action: 'market.create',
            entity: 'market_purchase',
            entityId: purchase.id,
            after: { total, lineCount: input.lines.length, cashDiscrepancy }
        });

        const result: CreateMarketResult = {
            id: String(purchase.id),
            total: Math.round(total * 100) / 100,
            businessDate,
            lineCount: input.lines.length,
            cashDiscrepancy
        };

        await storeResponse(trx, input.idempotency.key, result, 201);
        return result;
    });
}
