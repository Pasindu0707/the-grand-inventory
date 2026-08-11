import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db/index.js';
import { createMarketPurchase } from '../services/market.js';
import { findReplay, hashBody } from '../services/idempotency.js';
import { logCleaning, tasksDue, verifyCleaning } from '../services/cleaning.js';

const marketResult = z.object({
    id: z.string(),
    total: z.number(),
    businessDate: z.string(),
    lineCount: z.number(),
    cashDiscrepancy: z.number().nullable()
});

export async function marketRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    r.post(
        '/market',
        {
            preHandler: app.requireRole('owner', 'manager', 'storekeeper', 'purchasing'),
            schema: {
                headers: z.object({ 'idempotency-key': z.string().min(8).max(128) }).passthrough(),
                body: z.object({
                    supplierId: z.number().int().positive().nullish(),
                    // Required by the schema, and again in the service. A cash
                    // buy without the slip photo has no evidence at all.
                    photoUrl: z.string().min(1).max(512),
                    cashGiven: z.number().nonnegative().nullish(),
                    cashReturned: z.number().nonnegative().nullish(),
                    lines: z
                        .array(
                            z.object({
                                itemId: z.number().int().positive(),
                                qtyBase: z.number().positive(),
                                totalPrice: z.number().nonnegative()
                            })
                        )
                        .min(1)
                }),
                response: { 200: marketResult, 201: marketResult }
            }
        },
        async (req, reply) => {
            const key = req.headers['idempotency-key'] as string;
            const endpoint = 'POST /market';
            const requestHash = hashBody(req.body);

            const replay = await findReplay<z.infer<typeof marketResult>>(key, endpoint, requestHash);
            if (replay) return reply.status(200).send(replay.response);

            const result = await createMarketPurchase({
                locationId: req.locationId,
                supplierId: req.body.supplierId ?? null,
                photoUrl: req.body.photoUrl,
                cashGiven: req.body.cashGiven ?? null,
                cashReturned: req.body.cashReturned ?? null,
                lines: req.body.lines,
                boughtBy: req.user.sub,
                idempotency: { key, endpoint, requestHash }
            });

            return reply.status(201).send(result);
        }
    );

    r.get(
        '/market',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({
                    limit: z.coerce.number().int().min(1).max(200).default(50)
                }),
                response: {
                    200: z.array(
                        z.object({
                            id: z.string(),
                            supplierName: z.string().nullable(),
                            boughtAt: z.string(),
                            boughtBy: z.string(),
                            photoUrl: z.string().nullable(),
                            lineCount: z.number(),
                            total: z.number()
                        })
                    )
                }
            }
        },
        async (req) => {
            const rows = await db
                .selectFrom('market_purchase as mp')
                .leftJoin('suppliers', 'suppliers.id', 'mp.supplier_id')
                .innerJoin('users', 'users.id', 'mp.bought_by')
                .leftJoin('market_purchase_lines as l', 'l.market_id', 'mp.id')
                .select(({ fn }) => [
                    'mp.id',
                    'suppliers.name as supplierName',
                    'mp.bought_at as boughtAt',
                    'users.name as boughtBy',
                    'mp.photo_url as photoUrl',
                    fn.count('l.id').as('lineCount'),
                    // Null when a purchase somehow has no lines; normalised below.
                    fn.sum('l.total_price').as('total')
                ])
                .where('mp.location_id', '=', req.locationId)
                .groupBy(['mp.id', 'suppliers.name', 'users.name'])
                .orderBy('mp.bought_at', 'desc')
                .limit(req.query.limit)
                .execute();

            return rows.map((row) => ({
                id: String(row.id),
                supplierName: row.supplierName,
                boughtAt: new Date(row.boughtAt as unknown as string).toISOString(),
                boughtBy: row.boughtBy,
                photoUrl: row.photoUrl,
                lineCount: Number(row.lineCount),
                total: Number(row.total ?? 0)
            }));
        }
    );

    // ── Cleaning ────────────────────────────────────────────────────────────

    r.get(
        '/cleaning/today',
        {
            preHandler: app.authenticate,
            schema: {
                response: {
                    200: z.object({
                        businessDate: z.string(),
                        tasks: z.array(
                            z.object({
                                taskId: z.number(),
                                areaCode: z.string(),
                                areaName: z.string(),
                                name: z.string(),
                                frequency: z.enum(['daily', 'weekly', 'monthly']),
                                doneToday: z.boolean(),
                                lastDoneOn: z.string().nullable(),
                                lastDoneBy: z.string().nullable(),
                                verified: z.boolean(),
                                logId: z.string().nullable()
                            })
                        )
                    })
                }
            }
        },
        async (req) => tasksDue(req.locationId)
    );

    r.post(
        '/cleaning/log',
        {
            preHandler: app.requireRole(
                'owner',
                'manager',
                'cleaning',
                'storekeeper',
                'chef',
                'bar',
                'baker'
            ),
            schema: {
                body: z.object({
                    taskId: z.number().int().positive(),
                    photoUrl: z.string().max(512).nullish(),
                    note: z.string().max(500).nullish()
                }),
                response: { 201: z.object({ id: z.string(), businessDate: z.string() }) }
            }
        },
        async (req, reply) => {
            const result = await logCleaning({
                locationId: req.locationId,
                taskId: req.body.taskId,
                doneBy: req.user.sub,
                photoUrl: req.body.photoUrl ?? null,
                note: req.body.note ?? null
            });
            return reply.status(201).send(result);
        }
    );

    r.post(
        '/cleaning/log/:id/verify',
        {
            preHandler: app.requireRole('owner', 'manager'),
            schema: {
                params: z.object({ id: z.string() }),
                response: { 200: z.object({ ok: z.literal(true) }) }
            }
        },
        async (req) => {
            await verifyCleaning(req.params.id, req.locationId, req.user.sub);
            return { ok: true as const };
        }
    );
}
