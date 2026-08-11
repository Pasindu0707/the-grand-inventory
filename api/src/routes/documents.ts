import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db/index.js';
import { badRequest, notFound } from '../errors.js';
import { cancelIssue, fulfilIssue, requestIssue } from '../services/issues.js';
import { approveWastage, logWastage, receiveTransfer, transfer } from '../services/wastage.js';
import { closeCount, openCount, saveCountLines, verifyCount } from '../services/counts.js';
import { reverseDocument } from '../services/ledger.js';
import { findReplay, hashBody } from '../services/idempotency.js';
import { issueWindowsFor } from '../services/settings.js';

const idHeader = z.object({ 'idempotency-key': z.string().min(8).max(128) }).passthrough();

const fulfilResult = z.object({
    id: z.string(),
    businessDate: z.string(),
    linesIssued: z.number(),
    windowWarning: z.string().nullable(),
    shortfalls: z.array(
        z.object({
            itemName: z.string(),
            requested: z.number(),
            issued: z.number(),
            available: z.number()
        })
    )
});

export async function documentRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    // ── Issues ──────────────────────────────────────────────────────────────

    r.get(
        '/issue-windows',
        {
            preHandler: app.authenticate,
            schema: {
                response: {
                    200: z.array(z.object({ at: z.string(), label: z.string() }))
                }
            }
        },
        async (req) => issueWindowsFor(req.locationId)
    );

    r.post(
        '/issues',
        {
            preHandler: app.requireRole(
                'owner',
                'manager',
                'storekeeper',
                'chef',
                'bar',
                'baker',
                'cleaning'
            ),
            schema: {
                body: z.object({
                    toSectionId: z.number().int().positive(),
                    lines: z
                        .array(
                            z.object({
                                itemId: z.number().int().positive(),
                                qtyRequested: z.number().positive()
                            })
                        )
                        .min(1)
                }),
                response: { 201: z.object({ id: z.string() }) }
            }
        },
        async (req, reply) => {
            const result = await requestIssue({
                locationId: req.locationId,
                toSectionId: req.body.toSectionId,
                requestedBy: req.user.sub,
                lines: req.body.lines
            });
            return reply.status(201).send(result);
        }
    );

    r.post(
        '/issues/:id/fulfil',
        {
            preHandler: app.requireRole('owner', 'manager', 'storekeeper'),
            schema: {
                params: z.object({ id: z.string() }),
                headers: idHeader,
                body: z.object({
                    lines: z
                        .array(
                            z.object({
                                lineId: z.string(),
                                qtyIssued: z.number().nonnegative()
                            })
                        )
                        .default([]),
                    note: z.string().max(500).nullish()
                }),
                response: { 200: fulfilResult }
            }
        },
        async (req) => {
            const key = req.headers['idempotency-key'] as string;
            const endpoint = 'POST /issues/:id/fulfil';
            const requestHash = hashBody({ id: req.params.id, ...req.body });

            const replay = await findReplay<z.infer<typeof fulfilResult>>(key, endpoint, requestHash);
            if (replay) return replay.response;

            return fulfilIssue({
                issueId: req.params.id,
                locationId: req.locationId,
                issuedBy: req.user.sub,
                lines: req.body.lines,
                note: req.body.note ?? null,
                idempotency: { key, endpoint, requestHash }
            });
        }
    );

    r.post(
        '/issues/:id/cancel',
        {
            preHandler: app.requireRole('owner', 'manager', 'storekeeper'),
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await cancelIssue(req.params.id, req.locationId, req.user.sub);
            return { ok: true as const };
        }
    );

    r.get(
        '/issues',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({
                    status: z.enum(['requested', 'issued', 'cancelled']).optional(),
                    limit: z.coerce.number().int().min(1).max(200).default(50)
                }),
                response: {
                    200: z.array(
                        z.object({
                            id: z.string(),
                            sectionCode: z.string(),
                            sectionName: z.string(),
                            status: z.string(),
                            requestedBy: z.string(),
                            requestedAt: z.string(),
                            lineCount: z.number()
                        })
                    )
                }
            }
        },
        async (req) => {
            let q = db
                .selectFrom('issues')
                .innerJoin('sections', 'sections.id', 'issues.to_section_id')
                .innerJoin('users', 'users.id', 'issues.requested_by')
                .leftJoin('issue_lines', 'issue_lines.issue_id', 'issues.id')
                .select(({ fn }) => [
                    'issues.id',
                    'sections.code as sectionCode',
                    'sections.name as sectionName',
                    'issues.status',
                    'users.name as requestedBy',
                    'issues.requested_at as requestedAt',
                    fn.count('issue_lines.id').as('lineCount')
                ])
                .where('issues.location_id', '=', req.locationId)
                .groupBy(['issues.id', 'sections.code', 'sections.name', 'users.name']);

            if (req.query.status) q = q.where('issues.status', '=', req.query.status);

            const rows = await q.orderBy('issues.requested_at', 'desc').limit(req.query.limit).execute();

            return rows.map((row) => ({
                id: String(row.id),
                sectionCode: row.sectionCode,
                sectionName: row.sectionName,
                status: row.status,
                requestedBy: row.requestedBy,
                requestedAt: new Date(row.requestedAt as unknown as string).toISOString(),
                lineCount: Number(row.lineCount)
            }));
        }
    );

    r.get(
        '/issues/:id',
        {
            preHandler: app.authenticate,
            schema: {
                params: z.object({ id: z.string() }),
                response: {
                    200: z.object({
                        id: z.string(),
                        status: z.string(),
                        toSectionId: z.number(),
                        lines: z.array(
                            z.object({
                                lineId: z.string(),
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                qtyRequested: z.number(),
                                qtyIssued: z.number().nullable(),
                                availableInStore: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const issue = await db
                .selectFrom('issues')
                .select(['id', 'status', 'to_section_id'])
                .where('id', '=', req.params.id)
                .where('location_id', '=', req.locationId)
                .executeTakeFirst();
            if (!issue) throw notFound(`Issue ${req.params.id}`);

            const store = await db
                .selectFrom('sections')
                .select('id')
                .where('location_id', '=', req.locationId)
                .where('is_store', '=', true)
                .executeTakeFirstOrThrow();

            const lines = await db
                .selectFrom('issue_lines')
                .innerJoin('items', 'items.id', 'issue_lines.item_id')
                .leftJoin('current_stock as cs', (join) =>
                    join.onRef('cs.item_id', '=', 'items.id').on('cs.section_id', '=', store.id)
                )
                .select([
                    'issue_lines.id as lineId',
                    'items.id as itemId',
                    'items.code',
                    'items.name',
                    'items.stock_unit as stockUnit',
                    'issue_lines.qty_requested as qtyRequested',
                    'issue_lines.qty_issued as qtyIssued',
                    'cs.qty_base as availableInStore'
                ])
                .where('issue_lines.issue_id', '=', req.params.id)
                .orderBy('items.name')
                .execute();

            return {
                id: String(issue.id),
                status: issue.status,
                toSectionId: issue.to_section_id,
                lines: lines.map((l) => ({
                    lineId: String(l.lineId),
                    itemId: l.itemId,
                    code: l.code,
                    name: l.name,
                    stockUnit: l.stockUnit,
                    qtyRequested: Number(l.qtyRequested),
                    qtyIssued: l.qtyIssued === null ? null : Number(l.qtyIssued),
                    availableInStore: Number(l.availableInStore ?? 0)
                }))
            };
        }
    );

    // ── Wastage ─────────────────────────────────────────────────────────────

    r.get(
        '/reason-codes',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({ doc: z.string().optional() }),
                response: {
                    200: z.array(z.object({ code: z.string(), doc: z.string(), label: z.string() }))
                }
            }
        },
        async (req) => {
            let q = db.selectFrom('reason_codes').select(['code', 'doc', 'label']);
            if (req.query.doc) q = q.where('doc', '=', req.query.doc as 'wastage');
            return q.orderBy('label').execute();
        }
    );

    r.post(
        '/wastage',
        {
            preHandler: app.requireRole(
                'owner',
                'manager',
                'storekeeper',
                'chef',
                'bar',
                'baker'
            ),
            schema: {
                body: z.object({
                    sectionId: z.number().int().positive(),
                    itemId: z.number().int().positive(),
                    qtyBase: z.number().positive(),
                    reasonCode: z.string().min(2).max(20),
                    photoUrl: z.string().max(512).nullish(),
                    note: z.string().max(500).nullish()
                }),
                response: { 201: z.object({ id: z.string(), businessDate: z.string() }) }
            }
        },
        async (req, reply) => {
            const result = await logWastage({
                locationId: req.locationId,
                sectionId: req.body.sectionId,
                itemId: req.body.itemId,
                qtyBase: req.body.qtyBase,
                reasonCode: req.body.reasonCode,
                photoUrl: req.body.photoUrl ?? null,
                note: req.body.note ?? null,
                loggedBy: req.user.sub
            });
            return reply.status(201).send(result);
        }
    );

    r.post(
        '/wastage/:id/approve',
        {
            preHandler: app.requireRole('owner', 'manager'),
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await approveWastage(req.params.id, req.locationId, req.user.sub);
            return { ok: true as const };
        }
    );

    r.get(
        '/wastage',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({
                    limit: z.coerce.number().int().min(1).max(200).default(50),
                    pendingOnly: z.coerce.boolean().optional()
                }),
                response: {
                    200: z.array(
                        z.object({
                            id: z.string(),
                            itemName: z.string(),
                            sectionCode: z.string(),
                            qtyBase: z.number(),
                            stockUnit: z.string(),
                            reasonCode: z.string(),
                            reasonLabel: z.string(),
                            loggedBy: z.string(),
                            loggedAt: z.string(),
                            approved: z.boolean()
                        })
                    )
                }
            }
        },
        async (req) => {
            let q = db
                .selectFrom('wastage')
                .innerJoin('items', 'items.id', 'wastage.item_id')
                .innerJoin('sections', 'sections.id', 'wastage.section_id')
                .innerJoin('users', 'users.id', 'wastage.logged_by')
                .innerJoin('reason_codes', 'reason_codes.code', 'wastage.reason_code')
                .select([
                    'wastage.id',
                    'items.name as itemName',
                    'items.stock_unit as stockUnit',
                    'sections.code as sectionCode',
                    'wastage.qty_base as qtyBase',
                    'wastage.reason_code as reasonCode',
                    'reason_codes.label as reasonLabel',
                    'users.name as loggedBy',
                    'wastage.logged_at as loggedAt',
                    'wastage.approved_by as approvedBy'
                ])
                .where('wastage.location_id', '=', req.locationId);

            if (req.query.pendingOnly) q = q.where('wastage.approved_by', 'is', null);

            const rows = await q.orderBy('wastage.logged_at', 'desc').limit(req.query.limit).execute();

            return rows.map((row) => ({
                id: String(row.id),
                itemName: row.itemName,
                sectionCode: row.sectionCode,
                qtyBase: Number(row.qtyBase),
                stockUnit: row.stockUnit,
                reasonCode: row.reasonCode,
                reasonLabel: row.reasonLabel,
                loggedBy: row.loggedBy,
                loggedAt: new Date(row.loggedAt as unknown as string).toISOString(),
                approved: row.approvedBy !== null
            }));
        }
    );

    // ── Transfers ───────────────────────────────────────────────────────────

    r.post(
        '/transfers',
        {
            preHandler: app.requireRole('owner', 'manager', 'storekeeper'),
            schema: {
                body: z.object({
                    fromSectionId: z.number().int().positive(),
                    toSectionId: z.number().int().positive(),
                    itemId: z.number().int().positive(),
                    qtyBase: z.number().positive()
                }),
                response: { 201: z.object({ id: z.string(), completed: z.boolean() }) }
            }
        },
        async (req, reply) => {
            const result = await transfer({ ...req.body, sentBy: req.user.sub });
            return reply.status(201).send(result);
        }
    );

    r.post(
        '/transfers/:id/receive',
        {
            preHandler: app.requireRole('owner', 'manager', 'storekeeper'),
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ id: z.string() }) }
            }
        },
        async (req) => receiveTransfer(req.params.id, req.user.sub)
    );

    // ── Counts ──────────────────────────────────────────────────────────────

    const countLine = z.object({
        lineId: z.string(),
        itemId: z.number(),
        code: z.string(),
        name: z.string(),
        stockUnit: z.string(),
        qtyExpected: z.number(),
        qtyCounted: z.number().nullable()
    });

    r.post(
        '/counts/open',
        {
            preHandler: app.requireRole(
                'owner',
                'manager',
                'storekeeper',
                'chef',
                'bar',
                'baker'
            ),
            schema: {
                body: z.object({
                    sectionId: z.number().int().positive(),
                    countType: z.enum(['daily_critical', 'weekly_full', 'monthly_full'])
                }),
                response: { 201: z.object({ id: z.string(), lines: z.array(countLine) }) }
            }
        },
        async (req, reply) => {
            const result = await openCount({
                locationId: req.locationId,
                sectionId: req.body.sectionId,
                countType: req.body.countType,
                countedBy: req.user.sub
            });
            return reply.status(201).send(result);
        }
    );

    r.put(
        '/counts/:id/lines',
        {
            preHandler: app.authenticate,
            schema: {
                params: z.object({ id: z.string() }),
                body: z.object({
                    lines: z
                        .array(z.object({ lineId: z.string(), qtyCounted: z.number().nonnegative() }))
                        .min(1)
                }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await saveCountLines(req.params.id, req.locationId, req.body.lines);
            return { ok: true as const };
        }
    );

    r.post(
        '/counts/:id/close',
        {
            preHandler: app.requireRole(
                'owner',
                'manager',
                'storekeeper',
                'chef',
                'bar',
                'baker'
            ),
            schema: {
                params: z.object({ id: z.string() }),
                response: {
                    200: z.object({
                        id: z.string(),
                        adjustments: z.number(),
                        varianceValue: z.number(),
                        biggest: z.array(
                            z.object({
                                name: z.string(),
                                varianceQty: z.number(),
                                varianceValue: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => closeCount(req.params.id, req.locationId, req.user.sub)
    );

    r.post(
        '/counts/:id/verify',
        {
            preHandler: app.requireRole('owner', 'manager'),
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await verifyCount(req.params.id, req.locationId, req.user.sub);
            return { ok: true as const };
        }
    );

    r.get(
        '/counts/:id',
        {
            preHandler: app.authenticate,
            schema: {
                params: z.object({ id: z.string() }),
                response: {
                    200: z.object({
                        id: z.string(),
                        countType: z.string(),
                        sectionId: z.number(),
                        businessDate: z.string(),
                        closed: z.boolean(),
                        verified: z.boolean(),
                        lines: z.array(countLine)
                    })
                }
            }
        },
        async (req) => {
            const count = await db
                .selectFrom('stock_counts')
                .selectAll()
                .where('id', '=', req.params.id)
                .where('location_id', '=', req.locationId)
                .executeTakeFirst();
            if (!count) throw notFound(`Count ${req.params.id}`);

            const lines = await db
                .selectFrom('stock_count_lines')
                .innerJoin('items', 'items.id', 'stock_count_lines.item_id')
                .select([
                    'stock_count_lines.id as lineId',
                    'items.id as itemId',
                    'items.code',
                    'items.name',
                    'items.stock_unit as stockUnit',
                    'stock_count_lines.qty_expected as qtyExpected',
                    'stock_count_lines.qty_counted as qtyCounted'
                ])
                .where('stock_count_lines.count_id', '=', req.params.id)
                .orderBy('items.name')
                .execute();

            return {
                id: String(count.id),
                countType: count.count_type,
                sectionId: count.section_id,
                businessDate: count.business_date,
                closed: count.closed_at !== null,
                verified: count.verified_by !== null,
                lines: lines.map((l) => ({
                    lineId: String(l.lineId),
                    itemId: l.itemId,
                    code: l.code,
                    name: l.name,
                    stockUnit: l.stockUnit,
                    qtyExpected: Number(l.qtyExpected),
                    qtyCounted: Number(l.qtyCounted)
                }))
            };
        }
    );

    r.get(
        '/counts',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({
                    openOnly: z.coerce.boolean().optional(),
                    limit: z.coerce.number().int().min(1).max(100).default(30)
                }),
                response: {
                    200: z.array(
                        z.object({
                            id: z.string(),
                            countType: z.string(),
                            sectionCode: z.string(),
                            businessDate: z.string(),
                            countedBy: z.string(),
                            closed: z.boolean(),
                            verified: z.boolean()
                        })
                    )
                }
            }
        },
        async (req) => {
            let q = db
                .selectFrom('stock_counts')
                .innerJoin('sections', 'sections.id', 'stock_counts.section_id')
                .innerJoin('users', 'users.id', 'stock_counts.counted_by')
                .select([
                    'stock_counts.id',
                    'stock_counts.count_type as countType',
                    'sections.code as sectionCode',
                    'stock_counts.business_date as businessDate',
                    'users.name as countedBy',
                    'stock_counts.closed_at as closedAt',
                    'stock_counts.verified_by as verifiedBy'
                ])
                .where('stock_counts.location_id', '=', req.locationId);

            if (req.query.openOnly) q = q.where('stock_counts.closed_at', 'is', null);

            const rows = await q
                .orderBy('stock_counts.business_date', 'desc')
                .orderBy('stock_counts.id', 'desc')
                .limit(req.query.limit)
                .execute();

            return rows.map((row) => ({
                id: String(row.id),
                countType: row.countType,
                sectionCode: row.sectionCode,
                businessDate: row.businessDate,
                countedBy: row.countedBy,
                closed: row.closedAt !== null,
                verified: row.verifiedBy !== null
            }));
        }
    );

    // ── Reversals ───────────────────────────────────────────────────────────

    /**
     * The only way to correct a posted document.
     *
     *   "Corrections are reversals. New row, is_reversal = true, reverses_id
     *    set."
     *
     * There is deliberately no edit and no delete anywhere in this API.
     */
    r.post(
        '/documents/:doc/:id/reverse',
        {
            preHandler: app.requireRole('owner', 'manager'),
            schema: {
                params: z.object({
                    doc: z.enum(['grn', 'market', 'issue', 'wastage', 'transfer', 'count']),
                    id: z.string()
                }),
                body: z.object({ reason: z.string().min(5).max(500) }),
                response: { 200: z.object({ rowsReversed: z.number() }) }
            }
        },
        async (req) => {
            if (!req.body.reason.trim()) throw badRequest('A reversal needs a reason');
            const rowsReversed = await db
                .transaction()
                .execute((trx) =>
                    reverseDocument(trx, req.params.doc, req.params.id, req.user.sub, req.body.reason)
                );
            return { rowsReversed };
        }
    );
}
