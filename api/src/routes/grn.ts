import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../errors.js';
import { createGrn } from '../services/grn.js';
import { findReplay, hashBody } from '../services/idempotency.js';
import { audit } from '../services/ledger.js';
import { db } from '../db/index.js';
import { offsetOf, pageOf, pageQuery, toPage } from '../services/pagination.js';

const grnResult = z.object({
    id: z.string(),
    businessDate: z.string(),
    lineCount: z.number(),
    /** Something was refused or is still to come: management gets a report. */
    needsReview: z.boolean(),
});

export async function grnRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    r.post(
        '/grn',
        {
            preHandler: app.requireRole('storekeeper', 'management'),
            schema: {
                headers: z.object({ 'idempotency-key': z.string().min(8).max(128) }).passthrough(),
                body: z.object({
                    supplierId: z.number().int().positive(),
                    /** Set when this delivery fills a purchase order. */
                    poId: z.string().nullish(),
                    invoiceNo: z.string().max(64).nullish(),
                    invoiceDate: z
                        .string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
                        .nullish(),
                    photoUrl: z.string().max(512).nullish(),
                    lines: z
                        .array(
                            z.object({
                                itemPackId: z.number().int().positive(),
                                // Packs, never stock units. Fractional packs are
                                // real: half a sack gets delivered.
                                qtyPacks: z.number().positive().max(100_000),
                                expiryDate: z
                                    .string()
                                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                                    .nullish(),
                            })
                        )
                        .max(500),
                    /**
                     * Products ordered by name that arrived, by their order
                     * line. Not stock; recorded on the delivery and the order.
                     */
                    otherLines: z
                        .array(
                            z.object({
                                poLineId: z.string(),
                                qty: z.number().positive().max(100_000),
                            })
                        )
                        .max(200)
                        .optional(),
                    /**
                     * Refused at the door: sent back on the same lorry, never
                     * stock. Against the order line it came on.
                     */
                    rejections: z
                        .array(
                            z.object({
                                poLineId: z.string(),
                                qty: z.number().positive().max(100_000),
                                reasonCode: z.string().min(1).max(32),
                                note: z.string().trim().max(300).nullish(),
                                outcome: z.enum(['replacement', 'credit']),
                            })
                        )
                        .max(200)
                        .optional(),
                }),
                response: { 200: grnResult, 201: grnResult },
            },
        },
        async (req, reply) => {
            const key = req.headers['idempotency-key'] as string;
            const endpoint = 'POST /grn';
            const requestHash = hashBody(req.body);

            const replay = await findReplay<z.infer<typeof grnResult>>(key, endpoint, requestHash);
            if (replay) {
                // Same key, same body: hand back the original result rather than
                // receiving the same delivery twice.
                return reply.status(200).send(replay.response);
            }

            const result = await createGrn({
                locationId: req.locationId,
                supplierId: req.body.supplierId,
                poId: req.body.poId ?? null,
                invoiceNo: req.body.invoiceNo ?? null,
                invoiceDate: req.body.invoiceDate ?? null,
                photoUrl: req.body.photoUrl ?? null,
                lines: req.body.lines.map((l) => ({
                    itemPackId: l.itemPackId,
                    qtyPacks: l.qtyPacks,
                    expiryDate: l.expiryDate ?? null,
                })),
                otherLines: req.body.otherLines ?? [],
                rejections: (req.body.rejections ?? []).map((r) => ({
                    poLineId: r.poLineId,
                    qty: r.qty,
                    reasonCode: r.reasonCode,
                    note: r.note ?? null,
                    outcome: r.outcome,
                })),
                receivedBy: req.user.sub,
                idempotency: { key, endpoint, requestHash },
            });

            return reply.status(201).send(result);
        }
    );

    r.get(
        '/grn',
        {
            preHandler: app.authenticate,
            schema: {
                // Was the only list with its own `{ rows, total }` shape and a
                // raw offset. Moved onto the shared page envelope so every list
                // in the app answers the same way.
                querystring: pageQuery.extend({
                    /** Matches the supplier's name or the invoice number. */
                    search: z.string().trim().max(120).optional(),
                }),
                response: {
                    200: pageOf(
                        z.object({
                            id: z.string(),
                            supplierName: z.string(),
                            invoiceNo: z.string().nullable(),
                            invoiceDate: z.string().nullable(),
                            receivedAt: z.string(),
                            receivedBy: z.string(),
                            /** Set when it filled a purchase order. */
                            poId: z.string().nullable(),
                            lineCount: z.number(),
                            /** Lines refused at the door. */
                            returnedCount: z.number(),
                            needsReview: z.boolean(),
                            reviewed: z.boolean(),
                        })
                    ),
                },
            },
        },
        async (req) => {
            // The search has to be applied to the count as well as the rows, or
            // the pager describes a different set from the list under it.
            const search = req.query.search;
            const base = db
                .selectFrom('grn')
                .innerJoin('suppliers', 'suppliers.id', 'grn.supplier_id')
                .where('grn.location_id', '=', req.locationId)
                .$if(!!search, (q) =>
                    q.where((eb) =>
                        eb.or([
                            eb('suppliers.name', 'ilike', `%${search}%`),
                            eb('grn.invoice_no', 'ilike', `%${search}%`),
                        ])
                    )
                );

            const [rows, count] = await Promise.all([
                base
                    .innerJoin('users', 'users.id', 'grn.received_by')
                    .select([
                        'grn.id',
                        'suppliers.name as supplierName',
                        'grn.invoice_no as invoiceNo',
                        'grn.invoice_date as invoiceDate',
                        'grn.received_at as receivedAt',
                        'grn.po_id as poId',
                        'grn.needs_review as needsReview',
                        'grn.reviewed_at as reviewedAt',
                        'users.name as receivedBy',
                        sql<number>`(select count(*) from grn_rejections gr where gr.grn_id = grn.id)`.as(
                            'returnedCount'
                        ),
                        // Stock lines and products ordered by name both count:
                        // both came off the lorry.
                        sql<number>`(select count(*) from grn_lines gl where gl.grn_id = grn.id)
                                  + (select count(*) from grn_other_lines go where go.grn_id = grn.id)`.as(
                            'lineCount'
                        ),
                    ])
                    .orderBy('grn.received_at', 'desc')
                    .limit(req.query.limit)
                    .offset(offsetOf(req.query))
                    .execute(),
                base.select(({ fn }) => fn.countAll().as('n')).executeTakeFirstOrThrow(),
            ]);

            const items = rows.map((r2) => ({
                id: String(r2.id),
                supplierName: r2.supplierName,
                invoiceNo: r2.invoiceNo,
                invoiceDate: r2.invoiceDate === null ? null : String(r2.invoiceDate),
                receivedAt: new Date(r2.receivedAt as unknown as string).toISOString(),
                receivedBy: r2.receivedBy,
                poId: r2.poId === null ? null : String(r2.poId),
                lineCount: Number(r2.lineCount),
                returnedCount: Number(r2.returnedCount),
                needsReview: r2.needsReview,
                reviewed: r2.reviewedAt !== null,
            }));

            return toPage(items, count.n, req.query);
        }
    );

    /**
     * One delivery, read back.
     *
     * A delivery could be entered and then never looked at again: the only way
     * to find last Tuesday's invoice was the picker on the supplier-returns
     * form, which is a strange place to keep a record and is closed to anyone
     * who cannot raise one. A goods received note is a document the business
     * keeps, so it has a page.
     *
     * Each line carries what has already gone back to the supplier against it,
     * from the same query the return form uses -- so the answer to "did the bad
     * half of that delivery go back" is on the delivery.
     */
    r.get(
        '/grn/:id',
        {
            preHandler: app.authenticate,
            schema: {
                params: z.object({ id: z.string() }),
                response: {
                    200: z.object({
                        id: z.string(),
                        supplierId: z.number(),
                        supplierName: z.string(),
                        invoiceNo: z.string().nullable(),
                        invoiceDate: z.string().nullable(),
                        receivedAt: z.string(),
                        receivedBy: z.string(),
                        poId: z.string().nullable(),
                        photoUrl: z.string().nullable(),
                        lines: z.array(
                            z.object({
                                id: z.string(),
                                itemId: z.number(),
                                itemCode: z.string(),
                                itemName: z.string(),
                                stockUnit: z.string(),
                                packName: z.string(),
                                qtyInStockUnit: z.number(),
                                qtyPacks: z.number(),
                                qtyBase: z.number(),
                                expiryDate: z.string().nullable(),
                                /** Packs already sent back to the supplier. */
                                qtyPacksReturned: z.number(),
                                /** Came on an order delivery but was never on the order. */
                                notOnOrder: z.boolean(),
                            })
                        ),
                        /**
                         * The order as this delivery found it, line by line: what
                         * was ordered, what was still owed when it arrived, what
                         * came, what went back, anything beyond what was owed, and
                         * what it left owing. A record of that day -- unlike
                         * `order`, it does not move when later deliveries come.
                         */
                        atArrival: z.array(atArrivalRow),
                        /** Sent back at the door. */
                        rejections: z.array(rejectionRow),
                        /** Flagged for management, and whether they have read it. */
                        needsReview: z.boolean(),
                        reviewedBy: z.string().nullable(),
                        reviewedAt: z.string().nullable(),
                        /** Products ordered by name that came. Not stock. */
                        otherLines: z.array(
                            z.object({
                                id: z.string(),
                                name: z.string(),
                                unit: z.string().nullable(),
                                qty: z.number(),
                            })
                        ),
                        /**
                         * The order it was delivered against, as it stands now:
                         * what is still to come and what management took off.
                         * What the printed delivery note shows under the lines.
                         */
                        order: z
                            .object({
                                id: z.string(),
                                status: z.string(),
                                raisedAt: z.string(),
                                raisedBy: z.string(),
                                neededBy: z.string().nullable(),
                                lines: z.array(
                                    z.object({
                                        /** The order line, for voiding it from the report. */
                                        id: z.string(),
                                        itemId: z.number().nullable(),
                                        name: z.string(),
                                        isStockItem: z.boolean(),
                                        /** Stock unit, or what a named product is counted in. */
                                        unit: z.string().nullable(),
                                        packName: z.string().nullable(),
                                        qtyPacks: z.number().nullable(),
                                        qtyBase: z.number(),
                                        qtyReceivedBase: z.number(),
                                        qtyCreditedBase: z.number(),
                                        qtyOutstandingBase: z.number(),
                                        voided: z.boolean(),
                                        voidReason: z.string().nullable(),
                                    })
                                ),
                            })
                            .nullable(),
                    }),
                },
            },
        },
        async (req) => {
            const head = await db
                .selectFrom('grn')
                .innerJoin('suppliers', 'suppliers.id', 'grn.supplier_id')
                .innerJoin('users', 'users.id', 'grn.received_by')
                .leftJoin('users as reviewer', 'reviewer.id', 'grn.reviewed_by')
                .select([
                    'grn.id',
                    'grn.needs_review as needsReview',
                    'reviewer.name as reviewedBy',
                    'grn.reviewed_at as reviewedAt',
                    'grn.supplier_id as supplierId',
                    'suppliers.name as supplierName',
                    'grn.invoice_no as invoiceNo',
                    'grn.invoice_date as invoiceDate',
                    'grn.received_at as receivedAt',
                    'grn.po_id as poId',
                    'grn.photo_url as photoUrl',
                    'users.name as receivedBy',
                ])
                .where('grn.id', '=', req.params.id)
                .where('grn.location_id', '=', req.locationId)
                .executeTakeFirst();

            if (!head) throw notFound(`Delivery ${req.params.id}`);

            const { rows } = await sql<{
                id: string;
                itemId: number;
                itemCode: string;
                itemName: string;
                stockUnit: string;
                packName: string;
                qtyInStockUnit: number;
                qtyPacks: number;
                expiryDate: string | null;
                qtyPacksReturned: number;
            }>`
                select
                  gl.id                    as "id",
                  i.id                     as "itemId",
                  i.code                   as "itemCode",
                  i.name                   as "itemName",
                  i.stock_unit             as "stockUnit",
                  p.pack_name              as "packName",
                  p.qty_in_stock_unit      as "qtyInStockUnit",
                  gl.qty_packs             as "qtyPacks",
                  gl.expiry_date::text     as "expiryDate",
                  coalesce(r.returned, 0)  as "qtyPacksReturned"
                from grn_lines gl
                join item_packs p on p.id = gl.item_pack_id
                join items i      on i.id = p.item_id
                left join (
                  select srl.grn_line_id, sum(srl.qty_packs) as returned
                  from supplier_return_lines srl
                  join supplier_returns sr on sr.id = srl.return_id
                  where sr.status <> 'rejected'
                  group by srl.grn_line_id
                ) r on r.grn_line_id = gl.id
                where gl.grn_id = ${req.params.id}
                order by i.name
            `.execute(db);

            const lines = rows.map((l) => {
                const qtyPacks = Number(l.qtyPacks);
                const qtyInStockUnit = Number(l.qtyInStockUnit);
                return {
                    id: String(l.id),
                    itemId: l.itemId,
                    itemCode: l.itemCode,
                    itemName: l.itemName,
                    stockUnit: l.stockUnit,
                    packName: l.packName,
                    qtyInStockUnit,
                    qtyPacks,
                    qtyBase: qtyPacks * qtyInStockUnit,
                    expiryDate: l.expiryDate,
                    qtyPacksReturned: Number(l.qtyPacksReturned),
                    notOnOrder: false,
                };
            });

            const others = await db
                .selectFrom('grn_other_lines')
                .select(['id', 'description', 'unit', 'qty'])
                .where('grn_id', '=', req.params.id)
                .orderBy('id')
                .execute();

            const order = head.poId === null ? null : await orderAsItStands(String(head.poId));
            const rejections = await rejectionsFor([String(head.id)]);
            const atArrival = head.poId === null ? [] : await atArrivalFor(String(head.id));
            const orderedItems = new Set(
                order?.lines.filter((l) => l.itemId !== null).map((l) => l.itemId) ?? []
            );

            if (order) for (const l of lines) l.notOnOrder = !orderedItems.has(l.itemId);

            return {
                id: String(head.id),
                supplierId: head.supplierId,
                supplierName: head.supplierName,
                invoiceNo: head.invoiceNo,
                invoiceDate: head.invoiceDate === null ? null : String(head.invoiceDate),
                receivedAt: new Date(head.receivedAt as unknown as string).toISOString(),
                receivedBy: head.receivedBy,
                poId: head.poId === null ? null : String(head.poId),
                photoUrl: head.photoUrl,
                lines,
                rejections,
                needsReview: head.needsReview,
                reviewedBy: head.reviewedBy,
                reviewedAt: head.reviewedAt
                    ? new Date(head.reviewedAt as unknown as string).toISOString()
                    : null,
                atArrival,
                otherLines: others.map((o) => ({
                    id: String(o.id),
                    name: o.description,
                    unit: o.unit,
                    qty: Number(o.qty),
                })),
                order,
            };
        }
    );
}

/** One order line as a delivery found it. Quantities in stock units. */
const atArrivalRow = z.object({
    poLineId: z.string(),
    name: z.string(),
    isStockItem: z.boolean(),
    /** Stock unit, or what a named product is counted in. */
    unit: z.string().nullable(),
    /** The pack it was ordered in, to show packs beside the units. */
    packName: z.string().nullable(),
    packSize: z.number().nullable(),
    qtyOrderedBase: z.number(),
    qtyOwedBeforeBase: z.number(),
    qtyReceivedBase: z.number(),
    qtyRefusedBase: z.number(),
    qtyCreditedBase: z.number(),
    /** Came off the lorry beyond what was owed. */
    qtyOverBase: z.number(),
    /** What this delivery left owing: replacements included, credits not. */
    qtyOwedAfterBase: z.number(),
});

async function atArrivalFor(grnId: string) {
    const rows = await db
        .selectFrom('grn_order_lines as o')
        .innerJoin('purchase_order_lines as l', 'l.id', 'o.po_line_id')
        .leftJoin('items as i', 'i.id', 'l.item_id')
        .leftJoin('item_packs as p', 'p.id', 'l.item_pack_id')
        .select([
            'o.po_line_id',
            'l.item_id',
            'i.name as itemName',
            'i.stock_unit',
            'l.description',
            'l.unit',
            'p.pack_name',
            'p.qty_in_stock_unit',
            'o.qty_ordered_base',
            'o.qty_owed_before_base',
            'o.qty_received_base',
            'o.qty_refused_base',
            'o.qty_credited_base',
            'o.qty_over_base',
        ])
        .where('o.grn_id', '=', grnId)
        .orderBy('o.po_line_id')
        .execute();
    return rows.map((r) => {
        const owed = Number(r.qty_owed_before_base);
        const received = Number(r.qty_received_base);
        const credited = Number(r.qty_credited_base);
        return {
            poLineId: String(r.po_line_id),
            name: (r.itemName ?? r.description)!,
            isStockItem: r.item_id !== null,
            unit: r.item_id !== null ? r.stock_unit : r.unit,
            packName: r.pack_name,
            packSize: r.qty_in_stock_unit === null ? null : Number(r.qty_in_stock_unit),
            qtyOrderedBase: Number(r.qty_ordered_base),
            qtyOwedBeforeBase: owed,
            qtyReceivedBase: received,
            qtyRefusedBase: Number(r.qty_refused_base),
            qtyCreditedBase: credited,
            qtyOverBase: Number(r.qty_over_base),
            qtyOwedAfterBase: Math.max(0, Math.round((owed - received - credited) * 1000) / 1000),
        };
    });
}

/** One refusal at the door, as the delivery and the report show it. */
const rejectionRow = z.object({
    id: z.string(),
    name: z.string(),
    isStockItem: z.boolean(),
    packName: z.string().nullable(),
    /** Packs for an item, the count for a product ordered by name. */
    qty: z.number(),
    /** Stock units for an item; what a named product is counted in. */
    unit: z.string().nullable(),
    qtyBase: z.number(),
    reasonCode: z.string(),
    reasonLabel: z.string(),
    note: z.string().nullable(),
    outcome: z.enum(['replacement', 'credit']),
    creditNoteNo: z.string().nullable(),
});

async function rejectionsFor(grnIds: string[]) {
    if (grnIds.length === 0) return [];
    const rows = await db
        .selectFrom('grn_rejections as r')
        .leftJoin('items as i', 'i.id', 'r.item_id')
        .leftJoin('item_packs as p', 'p.id', 'r.item_pack_id')
        .innerJoin('reason_codes as rc', 'rc.code', 'r.reason_code')
        .select([
            'r.id',
            'r.grn_id',
            'r.item_id',
            'i.name as itemName',
            'i.stock_unit',
            'r.description',
            'r.unit',
            'p.pack_name',
            'r.qty_packs',
            'r.qty_base',
            'r.reason_code',
            'rc.label',
            'r.note',
            'r.outcome',
            'r.credit_note_no',
        ])
        .where('r.grn_id', 'in', grnIds)
        .orderBy('r.id')
        .execute();
    return rows.map((r) => ({
        id: String(r.id),
        grnId: String(r.grn_id),
        name: (r.itemName ?? r.description)!,
        isStockItem: r.item_id !== null,
        packName: r.pack_name,
        qty: Number(r.qty_packs),
        unit: r.item_id !== null ? r.stock_unit : r.unit,
        qtyBase: Number(r.qty_base),
        reasonCode: r.reason_code,
        reasonLabel: r.label,
        note: r.note,
        outcome: r.outcome,
        creditNoteNo: r.credit_note_no,
    }));
}

/** An order's lines now: what came, what is still to come, what was voided. */
async function orderAsItStands(poId: string) {
    const po = await db
        .selectFrom('purchase_orders as po')
        .innerJoin('users as u', 'u.id', 'po.raised_by')
        .select(['po.id', 'po.status', 'po.raised_at', 'po.needed_by', 'u.name as raisedBy'])
        .where('po.id', '=', poId)
        .executeTakeFirst();
    if (!po) return null;

    const lines = await db
        .selectFrom('purchase_order_lines as l')
        .leftJoin('items as i', 'i.id', 'l.item_id')
        .leftJoin('item_packs as p', 'p.id', 'l.item_pack_id')
        .select([
            'l.id',
            'l.item_id',
            'i.name as itemName',
            'i.stock_unit',
            'l.description',
            'l.unit',
            'p.pack_name',
            'l.qty_packs',
            'l.qty_base',
            'l.qty_received_base',
            'l.qty_credited_base',
            'l.voided_at',
            'l.void_reason',
        ])
        .where('l.po_id', '=', poId)
        .orderBy('l.id')
        .execute();

    return {
        id: String(po.id),
        status: po.status,
        raisedAt: new Date(po.raised_at as unknown as string).toISOString(),
        raisedBy: po.raisedBy,
        neededBy: po.needed_by === null ? null : String(po.needed_by),
        lines: lines.map((l) => {
            const qtyBase = Number(l.qty_base);
            const received = Number(l.qty_received_base);
            const credited = Number(l.qty_credited_base);
            const voided = l.voided_at !== null;
            return {
                id: String(l.id),
                itemId: l.item_id,
                name: (l.itemName ?? l.description)!,
                isStockItem: l.item_id !== null,
                unit: l.item_id !== null ? l.stock_unit : l.unit,
                packName: l.pack_name,
                qtyPacks: l.qty_packs === null ? null : Number(l.qty_packs),
                qtyBase,
                qtyReceivedBase: received,
                qtyOutstandingBase: voided
                    ? 0
                    : Math.max(0, Math.round((qtyBase - received - credited) * 1000) / 1000),
                qtyCreditedBase: credited,
                voided,
                voidReason: l.void_reason,
            };
        }),
    };
}

/**
 * Delivery reports: the deliveries management should read.
 *
 * A delivery is flagged when it came with goods refused at the door, or left
 * its order with something still to come. Each stays "new" until somebody in
 * management has opened it and said so; the count of new ones is on their
 * Overview and beside the menu entry.
 */
export async function deliveryReportRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    r.get(
        '/delivery-reports',
        {
            preHandler: app.requireRole('management'),
            schema: {
                querystring: pageQuery.extend({
                    /** Only the ones nobody in management has read yet. */
                    unseen: z.coerce.boolean().optional(),
                }),
                response: {
                    200: pageOf(
                        z.object({
                            id: z.string(),
                            supplierName: z.string(),
                            invoiceNo: z.string().nullable(),
                            receivedAt: z.string(),
                            receivedBy: z.string(),
                            poId: z.string().nullable(),
                            receivedCount: z.number(),
                            returnedCount: z.number(),
                            /** Lines on the order still to come, as it stands now. */
                            outstandingCount: z.number(),
                            /** Lines this delivery left owing, as it was that day. */
                            shortCount: z.number(),
                            /** Lines where more came than was owed. */
                            overCount: z.number(),
                            /** Stock items that came but were never on the order. */
                            notOnOrderCount: z.number(),
                            /** Refusals settled by credit with no note number yet. */
                            creditsPending: z.number(),
                            reviewedBy: z.string().nullable(),
                            reviewedAt: z.string().nullable(),
                        })
                    ),
                },
            },
        },
        async (req) => {
            const base = db
                .selectFrom('grn')
                .where('grn.location_id', '=', req.locationId)
                .where('grn.needs_review', '=', true)
                .$if(!!req.query.unseen, (q) => q.where('grn.reviewed_at', 'is', null));

            const [rows, count] = await Promise.all([
                base
                    .innerJoin('suppliers as s', 's.id', 'grn.supplier_id')
                    .innerJoin('users as u', 'u.id', 'grn.received_by')
                    .leftJoin('users as rv', 'rv.id', 'grn.reviewed_by')
                    .select([
                        'grn.id',
                        's.name as supplierName',
                        'grn.invoice_no as invoiceNo',
                        'grn.received_at as receivedAt',
                        'u.name as receivedBy',
                        'grn.po_id as poId',
                        'rv.name as reviewedBy',
                        'grn.reviewed_at as reviewedAt',
                        sql<number>`(select count(*) from grn_lines gl where gl.grn_id = grn.id)
                                  + (select count(*) from grn_other_lines go where go.grn_id = grn.id)`.as(
                            'receivedCount'
                        ),
                        sql<number>`(select count(*) from grn_rejections gr where gr.grn_id = grn.id)`.as(
                            'returnedCount'
                        ),
                        sql<number>`(select count(*) from grn_rejections gr
                                     where gr.grn_id = grn.id and gr.outcome = 'credit'
                                       and gr.credit_note_no is null)`.as('creditsPending'),
                        sql<number>`coalesce((select count(*) from purchase_order_lines l
                                     where l.po_id = grn.po_id and l.voided_at is null
                                       and l.qty_base > l.qty_received_base + l.qty_credited_base + 0.0005), 0)`.as(
                            'outstandingCount'
                        ),
                        sql<number>`(select count(*) from grn_order_lines o
                                     where o.grn_id = grn.id
                                       and o.qty_owed_before_base - o.qty_received_base
                                           - o.qty_credited_base > 0.0005)`.as('shortCount'),
                        sql<number>`(select count(*) from grn_order_lines o
                                     where o.grn_id = grn.id and o.qty_over_base > 0)`.as('overCount'),
                        sql<number>`case when grn.po_id is null then 0 else
                                     (select count(*) from grn_lines gl
                                        join item_packs p on p.id = gl.item_pack_id
                                       where gl.grn_id = grn.id
                                         and not exists (select 1 from purchase_order_lines l
                                                          where l.po_id = grn.po_id
                                                            and l.item_id = p.item_id)) end`.as(
                            'notOnOrderCount'
                        ),
                    ])
                    // Unread first, then newest.
                    .orderBy(sql`grn.reviewed_at is not null`)
                    .orderBy('grn.received_at', 'desc')
                    .limit(req.query.limit)
                    .offset(offsetOf(req.query))
                    .execute(),
                base.select(({ fn }) => fn.countAll().as('n')).executeTakeFirstOrThrow(),
            ]);

            const items = rows.map((x) => ({
                id: String(x.id),
                supplierName: x.supplierName,
                invoiceNo: x.invoiceNo,
                receivedAt: new Date(x.receivedAt as unknown as string).toISOString(),
                receivedBy: x.receivedBy,
                poId: x.poId === null ? null : String(x.poId),
                receivedCount: Number(x.receivedCount),
                returnedCount: Number(x.returnedCount),
                outstandingCount: Number(x.outstandingCount),
                shortCount: Number(x.shortCount),
                overCount: Number(x.overCount),
                notOnOrderCount: Number(x.notOnOrderCount),
                creditsPending: Number(x.creditsPending),
                reviewedBy: x.reviewedBy,
                reviewedAt: x.reviewedAt ? new Date(x.reviewedAt as unknown as string).toISOString() : null,
            }));
            return toPage(items, count.n, req.query);
        }
    );

    r.post(
        '/delivery-reports/:id/seen',
        {
            preHandler: app.requireRole('management'),
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ ok: z.literal(true) }) },
            },
        },
        async (req) => {
            const grn = await db
                .selectFrom('grn')
                .select(['id', 'needs_review', 'reviewed_at'])
                .where('id', '=', req.params.id)
                .where('location_id', '=', req.locationId)
                .executeTakeFirst();
            if (!grn || !grn.needs_review) throw notFound('That delivery report');
            if (grn.reviewed_at) return { ok: true as const };

            await db.transaction().execute(async (trx) => {
                await trx
                    .updateTable('grn')
                    .set({ reviewed_by: req.user.sub, reviewed_at: new Date() })
                    .where('id', '=', req.params.id)
                    .execute();
                await audit(trx, {
                    userId: req.user.sub,
                    action: 'grn.reviewed',
                    entity: 'grn',
                    entityId: req.params.id,
                });
            });
            return { ok: true as const };
        }
    );

    /** The supplier's credit note for goods refused at the door has arrived. */
    r.post(
        '/grn-rejections/:id/credit-note',
        {
            preHandler: app.requireRole('management'),
            schema: {
                params: z.object({ id: z.string() }),
                body: z.object({ creditNoteNo: z.string().trim().min(1).max(64) }),
                response: { 200: z.object({ ok: z.literal(true) }) },
            },
        },
        async (req) => {
            const row = await db
                .selectFrom('grn_rejections as r')
                .innerJoin('grn', 'grn.id', 'r.grn_id')
                .select(['r.id', 'r.outcome'])
                .where('r.id', '=', req.params.id)
                .where('grn.location_id', '=', req.locationId)
                .executeTakeFirst();
            if (!row) throw notFound('That return');
            if (row.outcome !== 'credit') {
                throw conflict('That item is coming back as a replacement, not a credit');
            }

            await db.transaction().execute(async (trx) => {
                await trx
                    .updateTable('grn_rejections')
                    .set({
                        credit_note_no: req.body.creditNoteNo,
                        credit_recorded_by: req.user.sub,
                        credit_recorded_at: new Date(),
                    })
                    .where('id', '=', req.params.id)
                    .execute();
                await audit(trx, {
                    userId: req.user.sub,
                    action: 'grn.rejection.credit',
                    entity: 'grn_rejections',
                    entityId: req.params.id,
                    after: { creditNoteNo: req.body.creditNoteNo },
                });
            });
            return { ok: true as const };
        }
    );
}

export { badRequest };
