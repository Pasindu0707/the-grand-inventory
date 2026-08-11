import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db/index.js';

export async function stockRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    /**
     * Current stock, derived from the ledger every time.
     *
     * There is deliberately no stock_qty column anywhere to drift out of step
     * with the movements that produced it. `belowReorder` is computed here
     * rather than stored for the same reason.
     */
    r.get(
        '/stock',
        {
            preHandler: app.authenticate,
            schema: {
                querystring: z.object({
                    sectionId: z.coerce.number().int().positive().optional(),
                    search: z.string().max(64).optional(),
                    belowReorder: z.coerce.boolean().optional(),
                }),
                response: {
                    200: z.object({
                        rows: z.array(
                            z.object({
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                sectionId: z.number(),
                                sectionCode: z.string(),
                                qtyBase: z.number(),
                                avgCost: z.number(),
                                value: z.number(),
                                reorderPoint: z.number(),
                                parLevel: z.number(),
                                isCritical: z.boolean(),
                                belowReorder: z.boolean(),
                            })
                        ),
                        totalValue: z.number(),
                    }),
                },
            },
        },
        async (req) => {
            let q = db
                .selectFrom('current_stock_valued as cs')
                .innerJoin('items', 'items.id', 'cs.item_id')
                .innerJoin('sections', 'sections.id', 'cs.section_id')
                .select([
                    'cs.item_id as itemId',
                    'items.code',
                    'items.name',
                    'items.stock_unit as stockUnit',
                    'cs.section_id as sectionId',
                    'sections.code as sectionCode',
                    'cs.qty_base as qtyBase',
                    'cs.avg_cost as avgCost',
                    'cs.value',
                    'items.reorder_point as reorderPoint',
                    'items.par_level as parLevel',
                    'items.is_critical as isCritical',
                ])
                .where('cs.location_id', '=', req.locationId)
                .where('items.is_active', '=', true);

            if (req.query.sectionId) q = q.where('cs.section_id', '=', req.query.sectionId);

            if (req.query.search) {
                const term = `%${req.query.search}%`;
                q = q.where((eb) =>
                    eb.or([eb('items.name', 'ilike', term), eb('items.code', 'ilike', term)])
                );
            }

            if (req.query.belowReorder) {
                q = q.whereRef('cs.qty_base', '<', 'items.reorder_point');
            }

            const rows = await q.orderBy('items.name').execute();

            return {
                rows: rows.map((s) => ({
                    ...s,
                    qtyBase: Number(s.qtyBase),
                    avgCost: Number(s.avgCost),
                    value: Number(s.value),
                    reorderPoint: Number(s.reorderPoint),
                    parLevel: Number(s.parLevel),
                    belowReorder: Number(s.qtyBase) < Number(s.reorderPoint),
                })),
                totalValue:
                    Math.round(rows.reduce((sum, s) => sum + Number(s.value), 0) * 100) / 100,
            };
        }
    );
}
