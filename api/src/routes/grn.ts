import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { createGrn } from '../services/grn.js';
import { findReplay, hashBody } from '../services/idempotency.js';
import { db } from '../db/index.js';

const grnResult = z.object({
    id: z.string(),
    total: z.number(),
    businessDate: z.string(),
    lineCount: z.number(),
    priceWarnings: z.array(
        z.object({
            itemPackId: z.number(),
            itemName: z.string(),
            packName: z.string(),
            previousPrice: z.number(),
            newPrice: z.number(),
            changePct: z.number(),
        })
    ),
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
                                packPrice: z.number().nonnegative().max(100_000_000),
                                expiryDate: z
                                    .string()
                                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                                    .nullish(),
                            })
                        )
                        .min(1, 'A GRN needs at least one line'),
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
                invoiceNo: req.body.invoiceNo ?? null,
                invoiceDate: req.body.invoiceDate ?? null,
                photoUrl: req.body.photoUrl ?? null,
                lines: req.body.lines.map((l) => ({
                    itemPackId: l.itemPackId,
                    qtyPacks: l.qtyPacks,
                    packPrice: l.packPrice,
                    expiryDate: l.expiryDate ?? null,
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
                querystring: z.object({
                    limit: z.coerce.number().int().min(1).max(200).default(50),
                    offset: z.coerce.number().int().min(0).default(0),
                }),
                response: {
                    200: z.object({
                        rows: z.array(
                            z.object({
                                id: z.string(),
                                supplierName: z.string(),
                                invoiceNo: z.string().nullable(),
                                receivedAt: z.string(),
                                total: z.number().nullable(),
                                lineCount: z.number(),
                            })
                        ),
                        total: z.number(),
                    }),
                },
            },
        },
        async (req) => {
            const base = db.selectFrom('grn').where('grn.location_id', '=', req.locationId);

            const [rows, count] = await Promise.all([
                base
                    .innerJoin('suppliers', 'suppliers.id', 'grn.supplier_id')
                    .leftJoin('grn_lines', 'grn_lines.grn_id', 'grn.id')
                    .select(({ fn }) => [
                        'grn.id',
                        'suppliers.name as supplierName',
                        'grn.invoice_no as invoiceNo',
                        'grn.received_at as receivedAt',
                        // Derived from the lines, not read from grn.total. The
                        // stored column is a convenience that can be null
                        // (seeded rows never set it) or stale; the lines are
                        // the document. Same principle as stock itself.
                        sql<number>`coalesce(sum(grn_lines.qty_packs * grn_lines.pack_price), 0)`.as(
                            'total'
                        ),
                        fn.count('grn_lines.id').as('lineCount'),
                    ])
                    .groupBy(['grn.id', 'suppliers.name'])
                    .orderBy('grn.received_at', 'desc')
                    .limit(req.query.limit)
                    .offset(req.query.offset)
                    .execute(),
                base.select(({ fn }) => fn.countAll().as('n')).executeTakeFirstOrThrow(),
            ]);

            return {
                rows: rows.map((r2) => ({
                    id: String(r2.id),
                    supplierName: r2.supplierName,
                    invoiceNo: r2.invoiceNo,
                    receivedAt: new Date(r2.receivedAt as unknown as string).toISOString(),
                    total: Number(r2.total ?? 0),
                    lineCount: Number(r2.lineCount),
                })),
                total: Number(count.n),
            };
        }
    );
}

export { badRequest };
