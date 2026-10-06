/**
 * Purchase orders.
 *
 * Raising one is the storekeeper's job, and management's -- the two people who
 * can actually look at the store's shelf before deciding something has to be
 * bought. A section asks for stock; if the store cannot cover it, the
 * storekeeper raises the purchase for the shortfall. That way nobody orders a
 * sack of flour that is sitting in the store already, and the buying decision
 * starts from what the store really holds.
 *
 * An order starts from the supplier: pick who it is going to, and what they
 * deliver is what is offered (services/supplier-items.ts). Something not on
 * their list can still go on the order, from the item master or typed in by
 * name, and is remembered against them for next time.
 *
 * Deciding one is management and only management: it is the single action in
 * this system that spends money. So management's own orders are approved by
 * being raised, and only the storekeeper's wait for a decision.
 *
 * Receiving is not here. A delivery against an order is entered as a GRN with
 * a `poId`, so there is one way for stock to arrive and one place that
 * converts packs into stock units. See services/grn.ts.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db/index.js';
import { offsetOf, pageOf, pageQuery, toPage } from '../services/pagination.js';
import {
    closePurchaseOrderShort,
    decidePurchaseOrder,
    raisePurchaseOrder,
    suggestedOrder,
    voidPoLine
} from '../services/purchasing.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const poLine = z.object({
    /** The order line, for ticking it off or voiding it. */
    id: z.string(),
    /** Null for a product ordered by name, which is not stock. */
    itemId: z.number().nullable(),
    name: z.string(),
    /** The item's stock unit, or what a named product is counted in. */
    stockUnit: z.string().nullable(),
    isStockItem: z.boolean(),
    qtyBase: z.number(),
    /** What was in the store when it was raised. */
    qtyInStore: z.number(),
    itemPackId: z.number().nullable(),
    packName: z.string().nullable(),
    qtyPacks: z.number().nullable(),
    qtyReceivedBase: z.number(),
    /** Refused at the door and settled by credit note: not coming. */
    qtyCreditedBase: z.number(),
    /** Still to come. Zero once the line is fully delivered, or voided. */
    qtyOutstandingBase: z.number(),
    /** Management took the undelivered balance off the order. */
    voided: z.boolean(),
    voidReason: z.string().nullable(),
    voidedBy: z.string().nullable()
});

const purchaseOrder = z.object({
    id: z.string(),
    status: z.string(),
    raisedBy: z.string(),
    raisedAt: z.string(),
    supplierId: z.number().nullable(),
    supplierName: z.string().nullable(),
    neededBy: z.string().nullable(),
    reason: z.string().nullable(),
    decidedBy: z.string().nullable(),
    decisionNote: z.string().nullable(),
    closedAt: z.string().nullable(),
    /** True when something has arrived but not everything. */
    partReceived: z.boolean(),
    lines: z.array(poLine)
});

export async function purchasingRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    r.post(
        '/purchase-orders',
        {
            // Not kitchen or cleaning. Their way in is a request: they ask for
            // stock, and the shortfall the store cannot cover is what the
            // storekeeper turns into a purchase.
            preHandler: app.requireRole('management', 'storekeeper'),
            schema: {
                body: z.object({
                    issueId: z.string().nullish(),
                    // Required: an order is placed with somebody.
                    supplierId: z.number().int().positive(),
                    neededBy: dateStr.nullish(),
                    reason: z.string().max(500).nullish(),
                    lines: z
                        .array(
                            z.union([
                                z.object({
                                    // Packs, not stock units: what you say to a
                                    // supplier, and what comes back on the invoice.
                                    itemPackId: z.number().int().positive(),
                                    qtyPacks: z.number().positive().max(100_000)
                                }),
                                z.object({
                                    // A product the item master does not have.
                                    name: z.string().trim().min(2).max(120),
                                    unit: z.string().trim().max(30).nullish(),
                                    qty: z.number().positive().max(100_000)
                                })
                            ])
                        )
                        .min(1)
                        .max(200)
                }),
                response: {
                    201: z.object({
                        id: z.string(),
                        /** "approved" when management raised it, else "requested". */
                        status: z.string()
                    })
                }
            }
        },
        async (req, reply) => {
            const result = await raisePurchaseOrder({
                locationId: req.locationId,
                raisedBy: req.user.sub,
                raisedByRole: req.user.role,
                issueId: req.body.issueId ?? null,
                supplierId: req.body.supplierId,
                neededBy: req.body.neededBy ?? null,
                reason: req.body.reason ?? null,
                lines: req.body.lines.map((l) =>
                    'itemPackId' in l
                        ? { itemPackId: l.itemPackId, qtyPacks: l.qtyPacks }
                        : { name: l.name, unit: l.unit ?? null, qty: l.qty }
                )
            });
            return reply.status(201).send(result);
        }
    );

    r.post(
        '/purchase-orders/:id/decide',
        {
            // Only management. Buying is the one thing that spends money.
            preHandler: app.requireRole('management'),
            schema: {
                params: z.object({ id: z.string() }),
                body: z.object({
                    decision: z.enum(['approved', 'rejected', 'ordered', 'done']),
                    note: z.string().max(500).nullish(),
                    /** Who it is being bought from, if it was not named up front. */
                    supplierId: z.number().int().positive().nullish()
                }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await decidePurchaseOrder(
                req.params.id,
                req.locationId,
                req.user.sub,
                req.body.decision,
                req.body.note ?? null,
                req.body.supplierId ?? null
            );
            return { ok: true as const };
        }
    );

    /**
     * The rest is never coming. Closing it short takes a reason, because in six
     * weeks "why did we only get six sacks" is a real question.
     */
    r.post(
        '/purchase-orders/:id/close',
        {
            preHandler: app.requireRole('management'),
            schema: {
                params: z.object({ id: z.string() }),
                body: z.object({ note: z.string().min(3).max(500) }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await closePurchaseOrderShort(
                req.params.id,
                req.locationId,
                req.user.sub,
                req.body.note
            );
            return { ok: true as const };
        }
    );

    /**
     * One item is not coming. Takes it off the order with a reason, and closes
     * the order if nothing else is outstanding.
     */
    r.post(
        '/purchase-orders/:id/lines/:lineId/void',
        {
            preHandler: app.requireRole('management'),
            schema: {
                params: z.object({ id: z.string(), lineId: z.string() }),
                body: z.object({ reason: z.string().trim().min(3).max(300) }),
                response: { 200: z.object({ orderComplete: z.boolean() }) }
            }
        },
        async (req) =>
            voidPoLine(req.params.id, req.params.lineId, req.locationId, req.user.sub, req.body.reason)
    );

    /**
     * What the store should be ordering, off the reorder points in the item
     * master. The point of this screen is that nobody has to have gone short
     * first.
     */
    r.get(
        '/purchase-orders/suggested',
        {
            preHandler: app.requireRole('management', 'storekeeper'),
            schema: {
                response: {
                    200: z.array(
                        z.object({
                            itemId: z.number(),
                            name: z.string(),
                            stockUnit: z.string(),
                            inStore: z.number(),
                            reorderPoint: z.number(),
                            parLevel: z.number(),
                            itemPackId: z.number().nullable(),
                            packName: z.string().nullable(),
                            qtyInStockUnit: z.number().nullable(),
                            suggestedPacks: z.number()
                        })
                    )
                }
            }
        },
        async (req) => suggestedOrder(req.locationId)
    );

    r.get(
        '/purchase-orders',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: pageQuery.extend({
                    status: z
                        .enum(['requested', 'approved', 'rejected', 'ordered', 'done'])
                        .optional(),
                    /** Everything not yet delivered or rejected, in one filter. */
                    open: z.coerce.boolean().optional(),
                    /**
                     * Only what this person raised.
                     *
                     * The screen has always told a section login "What you asked
                     * to be bought" while handing back every purchase order at
                     * the branch - true only for as long as one person was the
                     * only one asking. The raiser is the sole ownership marker
                     * available: a purchase order carries no section, and most
                     * are raised standalone rather than from a short request, so
                     * there is nothing to reach a section through.
                     */
                    mine: z.coerce.boolean().optional(),
                    /** A supplier's name, or an order number. */
                    search: z.string().trim().max(64).optional()
                }),
                response: { 200: pageOf(purchaseOrder) }
            }
        },
        async (req) => {
            let q = db
                .selectFrom('purchase_orders as po')
                .innerJoin('users as raiser', 'raiser.id', 'po.raised_by')
                .leftJoin('users as decider', 'decider.id', 'po.decided_by')
                .leftJoin('suppliers as s', 's.id', 'po.supplier_id')
                .select([
                    'po.id',
                    'po.status',
                    'raiser.name as raisedBy',
                    'po.raised_at as raisedAt',
                    'po.supplier_id as supplierId',
                    's.name as supplierName',
                    'po.needed_by as neededBy',
                    'po.reason',
                    'decider.name as decidedBy',
                    'po.decision_note as decisionNote',
                    'po.closed_at as closedAt'
                ])
                .where('po.location_id', '=', req.locationId);

            let countQ = db
                .selectFrom('purchase_orders as po')
                .leftJoin('suppliers as s', 's.id', 'po.supplier_id')
                .select(({ fn }) => fn.countAll().as('total'))
                .where('po.location_id', '=', req.locationId);

            // "14" finds order 14; anything else is matched against the
            // supplier's name. Applied to the count too, or the pager would
            // describe a different list from the one under it.
            const search = req.query.search;
            if (search) {
                const byName = `%${search}%`;
                const asId = /^\d+$/.test(search) ? search : null;
                q = q.where((eb) =>
                    eb.or([
                        eb('s.name', 'ilike', byName),
                        ...(asId ? [eb('po.id', '=', asId)] : [])
                    ])
                );
                countQ = countQ.where((eb) =>
                    eb.or([
                        eb('s.name', 'ilike', byName),
                        ...(asId ? [eb('po.id', '=', asId)] : [])
                    ])
                );
            }

            if (req.query.status) {
                q = q.where('po.status', '=', req.query.status);
                countQ = countQ.where('po.status', '=', req.query.status);
            }
            if (req.query.open) {
                q = q.where('po.status', 'in', ['requested', 'approved', 'ordered']);
                countQ = countQ.where('po.status', 'in', ['requested', 'approved', 'ordered']);
            }
            if (req.query.mine) {
                q = q.where('po.raised_by', '=', req.user.sub);
                countQ = countQ.where('po.raised_by', '=', req.user.sub);
            }
            const counted = await countQ.executeTakeFirst();

            const orders = await q
                .orderBy('po.raised_at', 'desc')
                .limit(req.query.limit)
                .offset(offsetOf(req.query))
                .execute();
            if (orders.length === 0) return toPage([], counted?.total, req.query);

            const lines = await db
                .selectFrom('purchase_order_lines as l')
                .leftJoin('items', 'items.id', 'l.item_id')
                .leftJoin('item_packs as p', 'p.id', 'l.item_pack_id')
                .leftJoin('users as voider', 'voider.id', 'l.voided_by')
                .select([
                    'l.id',
                    'l.po_id',
                    'l.voided_at',
                    'l.void_reason',
                    'voider.name as voidedBy',
                    'l.item_id as itemId',
                    'items.name as itemName',
                    'items.stock_unit as itemUnit',
                    'l.description',
                    'l.unit',
                    'l.qty_base as qtyBase',
                    'l.qty_in_store as qtyInStore',
                    'l.item_pack_id as itemPackId',
                    'p.pack_name as packName',
                    'l.qty_packs as qtyPacks',
                    'l.qty_received_base as qtyReceivedBase',
                    'l.qty_credited_base as qtyCreditedBase'
                ])
                .where(
                    'l.po_id',
                    'in',
                    orders.map((o) => o.id)
                )
                .orderBy('l.id')
                .execute();

            const byPo = new Map<string, typeof lines>();
            for (const line of lines) {
                const key = String(line.po_id);
                const list = byPo.get(key) ?? [];
                list.push(line);
                byPo.set(key, list);
            }

            const items = orders.map((o) => {
                const mine = (byPo.get(String(o.id)) ?? []).map((l) => {
                    const qtyBase = Number(l.qtyBase);
                    const received = Number(l.qtyReceivedBase);
                    const credited = Number(l.qtyCreditedBase);
                    const isStockItem = l.itemId !== null;
                    const voided = l.voided_at !== null;
                    return {
                        id: String(l.id),
                        itemId: l.itemId,
                        name: (l.itemName ?? l.description)!,
                        stockUnit: isStockItem ? l.itemUnit : l.unit,
                        isStockItem,
                        qtyBase,
                        qtyInStore: Number(l.qtyInStore),
                        itemPackId: l.itemPackId,
                        packName: l.packName,
                        qtyPacks: l.qtyPacks === null ? null : Number(l.qtyPacks),
                        qtyReceivedBase: received,
                        qtyOutstandingBase: voided
                            ? 0
                            : Math.max(0, Math.round((qtyBase - received - credited) * 1000) / 1000),
                        qtyCreditedBase: credited,
                        voided,
                        voidReason: l.void_reason,
                        voidedBy: l.voidedBy
                    };
                });

                return {
                    id: String(o.id),
                    status: o.status,
                    raisedBy: o.raisedBy,
                    raisedAt: new Date(o.raisedAt as unknown as string).toISOString(),
                    supplierId: o.supplierId,
                    supplierName: o.supplierName,
                    neededBy: o.neededBy,
                    reason: o.reason,
                    decidedBy: o.decidedBy,
                    decisionNote: o.decisionNote,
                    closedAt: o.closedAt ? new Date(o.closedAt).toISOString() : null,
                    partReceived:
                        mine.some((l) => l.qtyReceivedBase > 0) &&
                        mine.some((l) => l.qtyOutstandingBase > 0),
                    lines: mine
                };
            });

            return toPage(items, counted?.total, req.query);
        }
    );
}
