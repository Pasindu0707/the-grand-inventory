import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
    belowReorder,
    DEFAULT_SHRINKAGE_FLOOR_LKR,
    priceMovement,
    shrinkage,
    stockOuts,
    usageTrend,
    usageVariance,
    wastageByReason,
    wastageTrend
} from '../services/reports.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Defaults to the last 30 days, which is what someone opening a report means. */
const rangeQuery = z.object({
    from: dateStr.optional(),
    to: dateStr.optional()
});

function resolveRange(q: { from?: string; to?: string }) {
    const to = q.to ?? new Date().toISOString().slice(0, 10);
    const from =
        q.from ?? new Date(new Date(to).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    return { from, to };
}

export async function reportRoutes(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    // Reports are a management view. A chef does not need to see what the bar
    // is losing, and the owner reads everything.
    const managers = () => app.requireRole('management');

    r.get(
        '/reports/usage-variance',
        {
            preHandler: managers(),
            schema: {
                querystring: rangeQuery.extend({
                    minPct: z.coerce.number().min(0).max(1000).default(8)
                }),
                response: {
                    200: z.object({
                        from: z.string(),
                        to: z.string(),
                        rows: z.array(
                            z.object({
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                sectionCode: z.string(),
                                theoreticalQty: z.number(),
                                actualQty: z.number(),
                                varianceQty: z.number(),
                                variancePct: z.number(),
                                varianceValue: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await usageVariance(req.locationId, range, req.query.minPct) };
        }
    );

    r.get(
        '/reports/usage-variance/:itemId',
        {
            preHandler: managers(),
            schema: {
                params: z.object({ itemId: z.coerce.number().int().positive() }),
                querystring: rangeQuery,
                response: {
                    200: z.array(
                        z.object({
                            businessDate: z.string(),
                            theoreticalQty: z.number(),
                            actualQty: z.number()
                        })
                    )
                }
            }
        },
        async (req) => usageTrend(req.locationId, req.params.itemId, resolveRange(req.query))
    );

    r.get(
        '/reports/shrinkage',
        {
            preHandler: managers(),
            schema: {
                querystring: rangeQuery.extend({
                    // Below this, it is counting noise rather than loss.
                    minValue: z.coerce.number().min(0).default(DEFAULT_SHRINKAGE_FLOOR_LKR),
                    unexplainedOnly: z.coerce.boolean().default(true)
                }),
                response: {
                    200: z.object({
                        from: z.string(),
                        to: z.string(),
                        rows: z.array(
                            z.object({
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                sectionCode: z.string(),
                                businessDate: z.string(),
                                varianceQty: z.number(),
                                varianceValue: z.number(),
                                variancePct: z.number().nullable(),
                                hasWastageDoc: z.boolean()
                            })
                        ),
                        totalValue: z.number()
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            const all = await shrinkage(req.locationId, range, req.query.minValue);

            // A gap with a wastage document behind it is explained. Default to
            // hiding those, because the unexplained ones are the report.
            const rows = req.query.unexplainedOnly ? all.filter((x) => !x.hasWastageDoc) : all;

            return {
                ...range,
                rows,
                totalValue: Math.round(rows.reduce((s, x) => s + x.varianceValue, 0) * 100) / 100
            };
        }
    );

    r.get(
        '/reports/price-movement',
        {
            preHandler: managers(),
            schema: {
                querystring: rangeQuery.extend({
                    minPct: z.coerce.number().min(0).max(1000).default(5)
                }),
                response: {
                    200: z.object({
                        from: z.string(),
                        to: z.string(),
                        rows: z.array(
                            z.object({
                                itemPackId: z.number(),
                                itemName: z.string(),
                                packName: z.string(),
                                supplierName: z.string(),
                                effectiveFrom: z.string(),
                                previousPrice: z.number(),
                                newPrice: z.number(),
                                changePct: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await priceMovement(range, req.query.minPct) };
        }
    );

    r.get(
        '/reports/wastage',
        {
            preHandler: managers(),
            schema: {
                querystring: rangeQuery,
                response: {
                    200: z.object({
                        from: z.string(),
                        to: z.string(),
                        rows: z.array(
                            z.object({
                                reasonCode: z.string(),
                                reasonLabel: z.string(),
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                sectionCode: z.string(),
                                events: z.number(),
                                qtyBase: z.number(),
                                value: z.number()
                            })
                        ),
                        byReason: z.array(
                            z.object({
                                reasonCode: z.string(),
                                reasonLabel: z.string(),
                                events: z.number(),
                                value: z.number()
                            })
                        ),
                        totalValue: z.number()
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            const rows = await wastageByReason(req.locationId, range);

            const grouped = new Map<
                string,
                { reasonCode: string; reasonLabel: string; events: number; value: number }
            >();
            for (const row of rows) {
                const entry = grouped.get(row.reasonCode) ?? {
                    reasonCode: row.reasonCode,
                    reasonLabel: row.reasonLabel,
                    events: 0,
                    value: 0
                };
                entry.events += row.events;
                entry.value += row.value;
                grouped.set(row.reasonCode, entry);
            }

            const byReason = [...grouped.values()]
                .map((g) => ({ ...g, value: Math.round(g.value * 100) / 100 }))
                .sort((a, b) => b.value - a.value);

            return {
                ...range,
                rows,
                byReason,
                totalValue: Math.round(rows.reduce((s, x) => s + x.value, 0) * 100) / 100
            };
        }
    );

    r.get(
        '/reports/wastage/:itemId',
        {
            preHandler: managers(),
            schema: {
                params: z.object({ itemId: z.coerce.number().int().positive() }),
                querystring: rangeQuery,
                response: {
                    200: z.array(z.object({ businessDate: z.string(), qtyBase: z.number() }))
                }
            }
        },
        async (req) => wastageTrend(req.locationId, req.params.itemId, resolveRange(req.query))
    );

    r.get(
        '/reports/stock-outs',
        {
            preHandler: managers(),
            schema: {
                querystring: rangeQuery,
                response: {
                    200: z.object({
                        from: z.string(),
                        to: z.string(),
                        stockOuts: z.array(
                            z.object({
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                sectionCode: z.string(),
                                businessDate: z.string(),
                                balance: z.number()
                            })
                        ),
                        belowReorder: z.array(
                            z.object({
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                qtyBase: z.number(),
                                reorderPoint: z.number(),
                                parLevel: z.number(),
                                shortfall: z.number(),
                                isCritical: z.boolean()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            const [outs, low] = await Promise.all([
                stockOuts(req.locationId, range),
                belowReorder(req.locationId)
            ]);
            return { ...range, stockOuts: outs, belowReorder: low };
        }
    );
}
