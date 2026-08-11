import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db/index.js';
import { forbidden } from '../errors.js';
import { sectionsForUser, homeSectionFor } from '../plugins/auth.js';
import { issueWindowsFor } from '../services/settings.js';
import { findReplay, hashBody } from '../services/idempotency.js';
import {
    ask,
    cancelRequest,
    confirmReceived,
    decidePurchaseOrder,
    raisePurchaseOrder,
    release,
    shortagesFor
} from '../services/requests.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const shortage = z.object({
    itemId: z.number(),
    name: z.string(),
    stockUnit: z.string(),
    requested: z.number(),
    inStore: z.number(),
    short: z.number()
});

const releaseResult = z.object({
    id: z.string(),
    linesReleased: z.number(),
    shortfalls: z.array(
        z.object({
            itemName: z.string(),
            requested: z.number(),
            released: z.number(),
            available: z.number()
        })
    ),
    windowWarning: z.string().nullable()
});

export async function requestRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    /** Where am I, and what can I do? Drives the whole simplified UI. */
    r.get(
        '/me/context',
        {
            preHandler: app.authenticate,
            schema: {
                response: {
                    200: z.object({
                        role: z.string(),
                        locationId: z.number(),
                        mySectionIds: z.array(z.number()),
                        homeSectionId: z.number().nullable(),
                        canRelease: z.boolean(),
                        canDecidePurchases: z.boolean(),
                        canManageUsers: z.boolean(),
                        seesAdvanced: z.boolean()
                    })
                }
            }
        },
        async (req) => {
            const role = req.user.role;
            const [mySectionIds, homeSectionId] = await Promise.all([
                sectionsForUser(role, req.locationId),
                homeSectionFor(role, req.locationId)
            ]);
            return {
                role,
                locationId: req.locationId,
                mySectionIds,
                homeSectionId,
                canRelease: role === 'management' || role === 'storekeeper',
                canDecidePurchases: role === 'management',
                canManageUsers: role === 'admin',
                // Counts, wastage, deliveries and the five reports. Kept out of
                // the way of people who only ask for stock.
                seesAdvanced: role === 'management' || role === 'admin'
            };
        }
    );

    /**
     * The agreed handover times. Shown as a hint; never enforced.
     *
     *   "Issue windows, not an always-open store. This is a process rule the
     *    software should enforce by warning, not blocking."
     */
    r.get(
        '/issue-windows',
        {
            preHandler: app.authenticate,
            schema: {
                response: { 200: z.array(z.object({ at: z.string(), label: z.string() })) }
            }
        },
        async (req) => issueWindowsFor(req.locationId)
    );

    /** Check before asking, so the UI can offer a purchase order up front. */
    r.post(
        '/requests/check',
        {
            preHandler: app.authenticate,
            schema: {
                body: z.object({
                    lines: z
                        .array(
                            z.object({
                                itemId: z.number().int().positive(),
                                qtyRequested: z.number().positive()
                            })
                        )
                        .min(1)
                }),
                response: { 200: z.object({ shortages: z.array(shortage) }) }
            }
        },
        async (req) => ({ shortages: await shortagesFor(req.locationId, req.body.lines) })
    );

    r.post(
        '/requests',
        {
            preHandler: app.requireRole('management', 'storekeeper', 'kitchen', 'cleaning'),
            schema: {
                body: z.object({
                    sectionId: z.number().int().positive().optional(),
                    neededBy: dateStr.nullish(),
                    note: z.string().max(500).nullish(),
                    lines: z
                        .array(
                            z.object({
                                itemId: z.number().int().positive(),
                                qtyRequested: z.number().positive()
                            })
                        )
                        .min(1)
                }),
                response: {
                    201: z.object({ id: z.string(), shortages: z.array(shortage) })
                }
            }
        },
        async (req, reply) => {
            // A kitchen or cleaning login does not choose a section — it is
            // theirs. One less decision on a screen used in a hurry.
            const sectionId =
                req.body.sectionId ?? (await homeSectionFor(req.user.role, req.locationId));
            if (!sectionId) throw forbidden('You are not attached to a section at this branch');

            const result = await ask({
                locationId: req.locationId,
                sectionId,
                requestedBy: req.user.sub,
                neededBy: req.body.neededBy ?? null,
                note: req.body.note ?? null,
                lines: req.body.lines
            });
            return reply.status(201).send(result);
        }
    );

    r.post(
        '/requests/:id/release',
        {
            preHandler: app.requireRole('management', 'storekeeper'),
            schema: {
                params: z.object({ id: z.string() }),
                headers: z.object({ 'idempotency-key': z.string().min(8).max(128) }).passthrough(),
                body: z.object({
                    lines: z
                        .array(
                            z.object({ lineId: z.string(), qtyIssued: z.number().nonnegative() })
                        )
                        .default([])
                }),
                response: { 200: releaseResult }
            }
        },
        async (req) => {
            const key = req.headers['idempotency-key'] as string;
            const endpoint = 'POST /requests/:id/release';
            const requestHash = hashBody({ id: req.params.id, ...req.body });

            const replay = await findReplay<z.infer<typeof releaseResult>>(
                key,
                endpoint,
                requestHash
            );
            if (replay) return replay.response;

            return release({
                issueId: req.params.id,
                locationId: req.locationId,
                releasedBy: req.user.sub,
                role: req.user.role,
                lines: req.body.lines,
                idempotency: { key, endpoint, requestHash }
            });
        }
    );

    r.post(
        '/requests/:id/confirm',
        {
            preHandler: app.authenticate,
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            const mine = await sectionsForUser(req.user.role, req.locationId);
            await confirmReceived(req.params.id, req.locationId, req.user.sub, mine);
            return { ok: true as const };
        }
    );

    r.post(
        '/requests/:id/cancel',
        {
            preHandler: app.requireRole('management', 'storekeeper', 'kitchen', 'cleaning'),
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await cancelRequest(req.params.id, req.locationId, req.user.sub);
            return { ok: true as const };
        }
    );

    const requestRow = z.object({
        id: z.string(),
        sectionId: z.number(),
        sectionCode: z.string(),
        sectionName: z.string(),
        status: z.string(),
        requestedBy: z.string(),
        requestedAt: z.string(),
        neededBy: z.string().nullable(),
        note: z.string().nullable(),
        lineCount: z.number(),
        releasedBy: z.string().nullable(),
        isMine: z.boolean(),
        /** True when it is waiting on this user to do something. */
        needsMe: z.boolean()
    });

    r.get(
        '/requests',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({
                    status: z.enum(['requested', 'released', 'received', 'cancelled']).optional(),
                    mineOnly: z.coerce.boolean().optional(),
                    limit: z.coerce.number().int().min(1).max(200).default(50)
                }),
                response: { 200: z.array(requestRow) }
            }
        },
        async (req) => {
            const mine = await sectionsForUser(req.user.role, req.locationId);
            const canRelease = req.user.role === 'management' || req.user.role === 'storekeeper';

            let q = db
                .selectFrom('issues')
                .innerJoin('sections', 'sections.id', 'issues.to_section_id')
                .innerJoin('users as asker', 'asker.id', 'issues.requested_by')
                .leftJoin('users as giver', 'giver.id', 'issues.issued_by')
                .leftJoin('issue_lines', 'issue_lines.issue_id', 'issues.id')
                .select(({ fn }) => [
                    'issues.id',
                    'issues.to_section_id as sectionId',
                    'sections.code as sectionCode',
                    'sections.name as sectionName',
                    'issues.status',
                    'asker.name as requestedBy',
                    'issues.requested_at as requestedAt',
                    'issues.needed_by as neededBy',
                    'issues.note',
                    'giver.name as releasedBy',
                    fn.count('issue_lines.id').as('lineCount')
                ])
                .where('issues.location_id', '=', req.locationId)
                .groupBy([
                    'issues.id',
                    'sections.code',
                    'sections.name',
                    'asker.name',
                    'giver.name'
                ]);

            if (req.query.status) q = q.where('issues.status', '=', req.query.status);
            if (req.query.mineOnly && mine.length > 0) {
                q = q.where('issues.to_section_id', 'in', mine);
            }

            const rows = await q
                .orderBy('issues.requested_at', 'desc')
                .limit(req.query.limit)
                .execute();

            return rows.map((row) => {
                const isMine = mine.includes(row.sectionId);
                return {
                    id: String(row.id),
                    sectionId: row.sectionId,
                    sectionCode: row.sectionCode,
                    sectionName: row.sectionName,
                    status: row.status,
                    requestedBy: row.requestedBy,
                    requestedAt: new Date(row.requestedAt as unknown as string).toISOString(),
                    neededBy: row.neededBy,
                    note: row.note,
                    lineCount: Number(row.lineCount),
                    releasedBy: row.releasedBy,
                    isMine,
                    needsMe:
                        (row.status === 'requested' && canRelease) ||
                        (row.status === 'released' && isMine)
                };
            });
        }
    );

    // ── Purchase orders ─────────────────────────────────────────────────────

    r.post(
        '/purchase-orders',
        {
            preHandler: app.requireRole('management', 'storekeeper', 'kitchen', 'cleaning'),
            schema: {
                body: z.object({
                    issueId: z.string().nullish(),
                    neededBy: dateStr.nullish(),
                    reason: z.string().max(500).nullish(),
                    lines: z
                        .array(
                            z.object({
                                itemId: z.number().int().positive(),
                                qtyBase: z.number().positive(),
                                estPrice: z.number().nonnegative().nullish()
                            })
                        )
                        .min(1)
                }),
                response: { 201: z.object({ id: z.string() }) }
            }
        },
        async (req, reply) => {
            const result = await raisePurchaseOrder({
                locationId: req.locationId,
                raisedBy: req.user.sub,
                issueId: req.body.issueId ?? null,
                neededBy: req.body.neededBy ?? null,
                reason: req.body.reason ?? null,
                lines: req.body.lines.map((l) => ({
                    itemId: l.itemId,
                    qtyBase: l.qtyBase,
                    estPrice: l.estPrice ?? null
                }))
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
                    note: z.string().max(500).nullish()
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
                req.body.note ?? null
            );
            return { ok: true as const };
        }
    );

    r.get(
        '/purchase-orders',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({
                    status: z
                        .enum(['requested', 'approved', 'rejected', 'ordered', 'done'])
                        .optional(),
                    limit: z.coerce.number().int().min(1).max(200).default(50)
                }),
                response: {
                    200: z.array(
                        z.object({
                            id: z.string(),
                            status: z.string(),
                            raisedBy: z.string(),
                            raisedAt: z.string(),
                            neededBy: z.string().nullable(),
                            reason: z.string().nullable(),
                            decidedBy: z.string().nullable(),
                            decisionNote: z.string().nullable(),
                            lines: z.array(
                                z.object({
                                    itemId: z.number(),
                                    name: z.string(),
                                    stockUnit: z.string(),
                                    qtyBase: z.number(),
                                    qtyInStore: z.number(),
                                    estPrice: z.number().nullable()
                                })
                            )
                        })
                    )
                }
            }
        },
        async (req) => {
            let q = db
                .selectFrom('purchase_orders as po')
                .innerJoin('users as raiser', 'raiser.id', 'po.raised_by')
                .leftJoin('users as decider', 'decider.id', 'po.decided_by')
                .select([
                    'po.id',
                    'po.status',
                    'raiser.name as raisedBy',
                    'po.raised_at as raisedAt',
                    'po.needed_by as neededBy',
                    'po.reason',
                    'decider.name as decidedBy',
                    'po.decision_note as decisionNote'
                ])
                .where('po.location_id', '=', req.locationId);

            if (req.query.status) q = q.where('po.status', '=', req.query.status);

            const orders = await q.orderBy('po.raised_at', 'desc').limit(req.query.limit).execute();
            if (orders.length === 0) return [];

            const lines = await db
                .selectFrom('purchase_order_lines as l')
                .innerJoin('items', 'items.id', 'l.item_id')
                .select([
                    'l.po_id',
                    'items.id as itemId',
                    'items.name',
                    'items.stock_unit as stockUnit',
                    'l.qty_base as qtyBase',
                    'l.qty_in_store as qtyInStore',
                    'l.est_price as estPrice'
                ])
                .where(
                    'l.po_id',
                    'in',
                    orders.map((o) => o.id)
                )
                .execute();

            const byPo = new Map<string, typeof lines>();
            for (const line of lines) {
                const key = String(line.po_id);
                const list = byPo.get(key) ?? [];
                list.push(line);
                byPo.set(key, list);
            }

            return orders.map((o) => ({
                id: String(o.id),
                status: o.status,
                raisedBy: o.raisedBy,
                raisedAt: new Date(o.raisedAt as unknown as string).toISOString(),
                neededBy: o.neededBy,
                reason: o.reason,
                decidedBy: o.decidedBy,
                decisionNote: o.decisionNote,
                lines: (byPo.get(String(o.id)) ?? []).map((l) => ({
                    itemId: l.itemId,
                    name: l.name,
                    stockUnit: l.stockUnit,
                    qtyBase: Number(l.qtyBase),
                    qtyInStore: Number(l.qtyInStore),
                    estPrice: l.estPrice === null ? null : Number(l.estPrice)
                }))
            }));
        }
    );
}
