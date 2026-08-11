/**
 * Stock counts.
 *
 * The count is where shrinkage becomes visible. The ledger believes what the
 * documents told it; the count is the only moment anyone looks at the shelf.
 * Anomaly B — two gin bottles that leave with no document at all — is
 * detectable *only* here, which is why the expected quantity is frozen when the
 * count opens rather than read at close.
 *
 * If expected were read at close, a movement posted while someone was walking
 * round with a clipboard would silently absorb the variance, and the gap would
 * vanish. That is the difference between a count that finds theft and a count
 * that launders it.
 */
import { db } from '../db/index.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { audit, businessDateFor, postDocument, type LedgerLine } from './ledger.js';

export type CountType = 'daily_critical' | 'weekly_full' | 'monthly_full';

export interface OpenCountInput {
    locationId: number;
    sectionId: number;
    countType: CountType;
    countedBy: number;
}

export interface CountLineView {
    lineId: string;
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    qtyExpected: number;
    qtyCounted: number | null;
}

export async function openCount(input: OpenCountInput): Promise<{ id: string; lines: CountLineView[] }> {
    const section = await db
        .selectFrom('sections')
        .select('id')
        .where('id', '=', input.sectionId)
        .where('location_id', '=', input.locationId)
        .executeTakeFirst();
    if (!section) throw notFound(`Section ${input.sectionId}`);

    const businessDate = await businessDateFor(db, input.locationId);

    const existing = await db
        .selectFrom('stock_counts')
        .select('id')
        .where('location_id', '=', input.locationId)
        .where('section_id', '=', input.sectionId)
        .where('count_type', '=', input.countType)
        .where('business_date', '=', businessDate)
        .where('closed_at', 'is', null)
        .executeTakeFirst();
    if (existing) {
        throw conflict(`A ${input.countType} count for this section is already open`, {
            countId: String(existing.id)
        });
    }

    return db.transaction().execute(async (trx) => {
        const count = await trx
            .insertInto('stock_counts')
            .values({
                location_id: input.locationId,
                section_id: input.sectionId,
                count_type: input.countType,
                business_date: businessDate,
                counted_by: input.countedBy,
                is_demo: false
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        // Scope: the daily count covers only the critical items, because a
        // storekeeper asked to count 100 lines every morning will start
        // guessing by Thursday. A full count covers everything the section
        // currently holds.
        let itemsQuery = db
            .selectFrom('items')
            .leftJoin('current_stock as cs', (join) =>
                join.onRef('cs.item_id', '=', 'items.id').on('cs.section_id', '=', input.sectionId)
            )
            .select([
                'items.id as itemId',
                'items.code',
                'items.name',
                'items.stock_unit as stockUnit',
                'cs.qty_base as qtyBase'
            ])
            .where('items.is_active', '=', true);

        if (input.countType === 'daily_critical') {
            itemsQuery = itemsQuery.where('items.is_critical', '=', true);
        } else {
            itemsQuery = itemsQuery.where((eb) =>
                eb.or([eb('cs.qty_base', 'is not', null), eb('items.is_critical', '=', true)])
            );
        }

        const items = await itemsQuery.orderBy('items.name').execute();
        if (items.length === 0) throw badRequest('Nothing to count in this section');

        const lines: CountLineView[] = [];
        for (const item of items) {
            const expected = Number(item.qtyBase ?? 0);
            const line = await trx
                .insertInto('stock_count_lines')
                .values({
                    count_id: count.id,
                    item_id: item.itemId,
                    qty_expected: expected,
                    // Counted defaults to expected only so the column is
                    // non-null; close() refuses to run until each line has
                    // actually been entered.
                    qty_counted: 0,
                    variance_value: 0,
                    is_demo: false
                })
                .returning('id')
                .executeTakeFirstOrThrow();

            lines.push({
                lineId: String(line.id),
                itemId: item.itemId,
                code: item.code,
                name: item.name,
                stockUnit: item.stockUnit,
                qtyExpected: expected,
                qtyCounted: null
            });
        }

        await audit(trx, {
            userId: input.countedBy,
            action: 'count.open',
            entity: 'stock_counts',
            entityId: count.id,
            after: { countType: input.countType, sectionId: input.sectionId, lines: lines.length }
        });

        return { id: String(count.id), lines };
    });
}

export async function saveCountLines(
    countId: string,
    locationId: number,
    lines: { lineId: string; qtyCounted: number }[]
): Promise<void> {
    const count = await db
        .selectFrom('stock_counts')
        .select(['id', 'closed_at'])
        .where('id', '=', countId)
        .where('location_id', '=', locationId)
        .executeTakeFirst();
    if (!count) throw notFound(`Count ${countId}`);
    if (count.closed_at) throw conflict('This count is closed');

    await db.transaction().execute(async (trx) => {
        for (const line of lines) {
            if (line.qtyCounted < 0) throw badRequest('A counted quantity cannot be negative');
            await trx
                .updateTable('stock_count_lines')
                .set({ qty_counted: line.qtyCounted })
                .where('id', '=', line.lineId)
                .where('count_id', '=', countId)
                .execute();
        }
    });
}

export interface CloseCountResult {
    id: string;
    adjustments: number;
    varianceValue: number;
    biggest: { name: string; varianceQty: number; varianceValue: number }[];
}

/**
 * Closing writes the adjustment rows that make the ledger agree with the shelf.
 *
 * Every non-zero variance becomes a COUNTADJ ledger row, valued at the current
 * weighted average. Those rows are what the shrinkage report reads: a gap with
 * no wastage document behind it is exactly the signature of anomaly B.
 */
export async function closeCount(
    countId: string,
    locationId: number,
    closedBy: number
): Promise<CloseCountResult> {
    const count = await db
        .selectFrom('stock_counts')
        .selectAll()
        .where('id', '=', countId)
        .where('location_id', '=', locationId)
        .executeTakeFirst();
    if (!count) throw notFound(`Count ${countId}`);
    if (count.closed_at) throw conflict('This count is already closed');

    const lines = await db
        .selectFrom('stock_count_lines')
        .innerJoin('items', 'items.id', 'stock_count_lines.item_id')
        .leftJoin('item_cost_state as ics', (join) =>
            join
                .onRef('ics.item_id', '=', 'stock_count_lines.item_id')
                .on('ics.location_id', '=', locationId)
        )
        .select([
            'stock_count_lines.id as lineId',
            'stock_count_lines.item_id as itemId',
            'stock_count_lines.qty_expected as qtyExpected',
            'stock_count_lines.qty_counted as qtyCounted',
            'items.name',
            'ics.avg_cost as avgCost'
        ])
        .where('stock_count_lines.count_id', '=', countId)
        .execute();

    return db.transaction().execute(async (trx) => {
        const ledgerLines: LedgerLine[] = [];
        const biggest: CloseCountResult['biggest'] = [];
        let totalVariance = 0;
        let docLine = 0;

        for (const line of lines) {
            const varianceQty = Number(line.qtyCounted) - Number(line.qtyExpected);
            const varianceValue = varianceQty * Number(line.avgCost ?? 0);

            await trx
                .updateTable('stock_count_lines')
                .set({ variance_value: Math.round(varianceValue * 100) / 100 })
                .where('id', '=', line.lineId)
                .execute();

            if (varianceQty === 0) continue;

            totalVariance += varianceValue;
            biggest.push({
                name: line.name,
                varianceQty,
                varianceValue: Math.round(varianceValue * 100) / 100
            });

            docLine += 1;
            ledgerLines.push({
                sectionId: count.section_id,
                itemId: line.itemId,
                qtyBase: varianceQty,
                reasonCode: 'COUNTADJ',
                docLine
            });
        }

        if (ledgerLines.length > 0) {
            await postDocument(trx, {
                doc: 'count',
                docId: count.id,
                locationId,
                businessDate: count.business_date,
                lines: ledgerLines,
                createdBy: closedBy
            });
        }

        await trx
            .updateTable('stock_counts')
            .set({ closed_at: new Date() })
            .where('id', '=', countId)
            .execute();

        await audit(trx, {
            userId: closedBy,
            action: 'count.close',
            entity: 'stock_counts',
            entityId: countId,
            after: { adjustments: ledgerLines.length, varianceValue: totalVariance }
        });

        biggest.sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue));

        return {
            id: String(countId),
            adjustments: ledgerLines.length,
            varianceValue: Math.round(totalVariance * 100) / 100,
            biggest: biggest.slice(0, 5)
        };
    });
}

export async function verifyCount(
    countId: string,
    locationId: number,
    verifiedBy: number
): Promise<void> {
    const count = await db
        .selectFrom('stock_counts')
        .select(['id', 'closed_at', 'counted_by', 'verified_by'])
        .where('id', '=', countId)
        .where('location_id', '=', locationId)
        .executeTakeFirst();
    if (!count) throw notFound(`Count ${countId}`);
    if (!count.closed_at) throw conflict('Close the count before verifying it');
    if (count.verified_by) throw conflict('Already verified');
    if (count.counted_by === verifiedBy) {
        // The entire value of verification is that it is a second pair of eyes.
        throw badRequest('A count cannot be verified by the person who counted it');
    }

    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('stock_counts')
            .set({ verified_by: verifiedBy })
            .where('id', '=', countId)
            .execute();
        await audit(trx, {
            userId: verifiedBy,
            action: 'count.verify',
            entity: 'stock_counts',
            entityId: countId
        });
    });
}
