/**
 * The only module in this codebase permitted to write to stock_ledger.
 *
 *   "Never write to stock_ledger from a controller. One service function per
 *    document type; the document is the API, the ledger is a consequence."
 *
 * eslint.config.js enforces that with no-restricted-imports, so the rule holds
 * against the next person as well as the current one.
 *
 * One invariant lives here and nowhere else: business_date comes from the
 * location's day_start, never from the client's clock. The Coffee Lounge runs
 * 04:00-04:00, so "today" there is not "today" anywhere else, and a count taken
 * at 02:00 belongs to the previous business day.
 *
 * The ledger records quantities only. There is no costing in this system -- see
 * migration 0009.
 */
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database, DocType } from '../db/types.js';
import { db } from '../db/index.js';
import { badRequest } from '../errors.js';

export type Tx = Transaction<Database>;

export interface LedgerLine {
    sectionId: number;
    itemId: number;
    /** Signed, in the item's stock_unit. Negative removes stock. */
    qtyBase: number;
    docLine?: number;
    reasonCode?: string | null;
    note?: string | null;
}

export interface PostDocumentInput {
    doc: DocType;
    docId: number | string;
    locationId: number;
    lines: LedgerLine[];
    createdBy: number;
    /** Defaults to the location's current business date. */
    businessDate?: string;
    isReversal?: boolean;
    reversesId?: string | null;
    isDemo?: boolean;
}

/**
 * The business date for a location right now.
 *
 * Postgres does the arithmetic because `day_start` is a `time` and the shift is
 * a calendar operation -- doing it in JS would mean reconstructing timezone
 * rules that the database already has.
 */
export async function businessDateFor(
    trx: Kysely<Database> | Tx,
    locationId: number,
    at: Date = new Date()
): Promise<string> {
    const row = await sql<{ business_date: string }>`
        select ((${at}::timestamptz at time zone 'Asia/Colombo')
                - (select day_start from locations where id = ${locationId}))::date
               as business_date
    `.execute(trx);

    const value = row.rows[0]?.business_date;
    if (!value) throw badRequest(`Unknown location ${locationId}`);
    return value;
}

/**
 * Writes one document's movements to the ledger.
 *
 * Must be called inside a transaction that also writes the document rows: the
 * document and its ledger effect either both exist or neither does.
 */
export async function postDocument(trx: Tx, input: PostDocumentInput): Promise<void> {
    if (input.lines.length === 0) {
        throw badRequest('A document must move at least one line');
    }

    const businessDate =
        input.businessDate ?? (await businessDateFor(trx, input.locationId));

    for (const line of input.lines) {
        if (line.qtyBase === 0) {
            throw badRequest(`Zero quantity on item ${line.itemId} - nothing to record`);
        }

        await trx
            .insertInto('stock_ledger')
            .values({
                business_date: businessDate,
                location_id: input.locationId,
                section_id: line.sectionId,
                item_id: line.itemId,
                qty_base: line.qtyBase,
                doc: input.doc,
                doc_id: String(input.docId),
                doc_line: line.docLine ?? null,
                reason_code: line.reasonCode ?? null,
                created_by: input.createdBy,
                is_reversal: input.isReversal ?? false,
                reverses_id: input.reversesId ?? null,
                note: line.note ?? null,
                is_demo: input.isDemo ?? false,
            })
            .execute();
    }
}

/**
 * Corrections are reversals, never edits.
 *
 * Emits mirror-image rows for every movement of the original document, each
 * pointing back at the row it undoes. The originals stay exactly where they
 * are, which is the entire reason the ledger is trustworthy.
 */
export async function reverseDocument(
    trx: Tx,
    doc: DocType,
    docId: number | string,
    reversedBy: number,
    note: string
): Promise<number> {
    const originals = await trx
        .selectFrom('stock_ledger')
        .selectAll()
        .where('doc', '=', doc)
        .where('doc_id', '=', String(docId))
        .where('is_reversal', '=', false)
        .execute();

    if (originals.length === 0) {
        throw badRequest(`No ledger rows for ${doc} ${docId}`);
    }

    const already = await trx
        .selectFrom('stock_ledger')
        .select('id')
        .where('reverses_id', 'in', originals.map((o) => o.id))
        .executeTakeFirst();

    if (already) throw badRequest(`${doc} ${docId} has already been reversed`);

    for (const o of originals) {
        await trx
            .insertInto('stock_ledger')
            .values({
                business_date: o.business_date,
                location_id: o.location_id,
                section_id: o.section_id,
                item_id: o.item_id,
                qty_base: -o.qty_base,
                doc: o.doc,
                doc_id: o.doc_id,
                doc_line: o.doc_line,
                reason_code: o.reason_code,
                created_by: reversedBy,
                is_reversal: true,
                reverses_id: o.id,
                note,
                is_demo: o.is_demo,
            })
            .execute();
    }

    return originals.length;
}

/** Writes an audit row. Every mutation should leave one. */
export async function audit(
    trx: Tx,
    entry: {
        userId: number;
        action: string;
        entity: string;
        entityId?: string | number | null;
        before?: unknown;
        after?: unknown;
    }
): Promise<void> {
    await trx
        .insertInto('audit_log')
        .values({
            user_id: entry.userId,
            action: entry.action,
            entity: entry.entity,
            entity_id: entry.entityId == null ? null : String(entry.entityId),
            before: entry.before === undefined ? null : JSON.stringify(entry.before),
            after: entry.after === undefined ? null : JSON.stringify(entry.after),
        })
        .execute();
}

export { db };
