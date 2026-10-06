import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
    belowReorder,
    DEFAULT_SHRINKAGE_FLOOR_PCT,
    shrinkage,
    stockOuts,
    usageTrend,
    usageVariance,
    wastageByReason,
    wastageTrend
} from '../services/reports.js';
import {
    consumptionBySection,
    countAccuracy,
    deadStock,
    openPurchaseOrders,
    openReturns,
    requestServiceLevel,
    returnsByReason,
    stockOnHand,
    supplierPerformance
} from '../services/reports-ops.js';
import { purchaseList, sectionRequests } from '../services/reports-periodic.js';

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
                                variancePct: z.number()
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
                    // Below this share of the shelf, it is counting noise
                    // rather than loss.
                    minPct: z.coerce.number().min(0).max(100).default(DEFAULT_SHRINKAGE_FLOOR_PCT),
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
                                variancePct: z.number().nullable(),
                                hasWastageDoc: z.boolean()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            const all = await shrinkage(req.locationId, range, req.query.minPct);

            // A gap with a wastage document behind it is explained. Default to
            // hiding those, because the unexplained ones are the report.
            const rows = req.query.unexplainedOnly ? all.filter((x) => !x.hasWastageDoc) : all;

            return { ...range, rows };
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
                                qtyBase: z.number()
                            })
                        ),
                        byReason: z.array(
                            z.object({
                                reasonCode: z.string(),
                                reasonLabel: z.string(),
                                events: z.number()
                            })
                        ),
                        totalEvents: z.number()
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            const rows = await wastageByReason(req.locationId, range);

            const grouped = new Map<
                string,
                { reasonCode: string; reasonLabel: string; events: number }
            >();
            for (const row of rows) {
                const entry = grouped.get(row.reasonCode) ?? {
                    reasonCode: row.reasonCode,
                    reasonLabel: row.reasonLabel,
                    events: 0
                };
                entry.events += row.events;
                grouped.set(row.reasonCode, entry);
            }

            const byReason = [...grouped.values()].sort((a, b) => b.events - a.events);

            return {
                ...range,
                rows,
                byReason,
                totalEvents: rows.reduce((s, x) => s + x.events, 0)
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
                                shortfall: z.number()
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

    // ── The operating reports ───────────────────────────────────────────────
    //
    // Same shape as the four above: a range in, `{ from, to, rows }` out. The
    // screen renders them from one generic runner, so a report that answered in
    // its own shape would need its own special case on the client for no gain.

    r.get(
        '/reports/open-purchase-orders',
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
                                id: z.string(),
                                status: z.string(),
                                supplierName: z.string().nullable(),
                                raisedBy: z.string(),
                                raisedAt: z.string(),
                                neededBy: z.string().nullable(),
                                lineCount: z.number(),
                                daysOpen: z.number(),
                                daysLate: z.number(),
                                linesOutstanding: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await openPurchaseOrders(req.locationId, range) };
        }
    );

    r.get(
        '/reports/service-level',
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
                                sectionId: z.number(),
                                sectionName: z.string(),
                                requests: z.number(),
                                stillWaiting: z.number(),
                                lines: z.number(),
                                linesInFull: z.number(),
                                linesShort: z.number(),
                                fillRatePct: z.number().nullable(),
                                qtyFillPct: z.number().nullable(),
                                avgHoursToRelease: z.number().nullable()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await requestServiceLevel(req.locationId, range) };
        }
    );

    r.get(
        '/reports/supplier-performance',
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
                                supplierId: z.number(),
                                supplierName: z.string(),
                                orders: z.number(),
                                deliveries: z.number(),
                                fillRatePct: z.number().nullable(),
                                lateOrders: z.number(),
                                avgDaysToClose: z.number().nullable(),
                                deliveryLines: z.number(),
                                returns: z.number(),
                                credited: z.number(),
                                returnRatePct: z.number().nullable()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await supplierPerformance(req.locationId, range) };
        }
    );

    r.get(
        '/reports/stock-on-hand',
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
                                sectionId: z.number(),
                                sectionName: z.string(),
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                qtyBase: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await stockOnHand(req.locationId, range) };
        }
    );

    r.get(
        '/reports/dead-stock',
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
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                sectionName: z.string(),
                                qtyBase: z.number(),
                                lastMovedOn: z.string().nullable(),
                                daysSinceMoved: z.number().nullable()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await deadStock(req.locationId, range) };
        }
    );

    r.get(
        '/reports/consumption',
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
                                sectionId: z.number(),
                                sectionName: z.string(),
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                qtyBase: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await consumptionBySection(req.locationId, range) };
        }
    );

    r.get(
        '/reports/count-accuracy',
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
                                countedBy: z.string(),
                                sectionName: z.string(),
                                counts: z.number(),
                                lines: z.number(),
                                linesOff: z.number(),
                                accuracyPct: z.number().nullable()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await countAccuracy(req.locationId, range) };
        }
    );

    r.get(
        '/reports/returns',
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
                                sectionReturns: z.number(),
                                supplierReturns: z.number(),
                                credited: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await returnsByReason(req.locationId, range) };
        }
    );

    r.get(
        '/reports/open-returns',
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
                                id: z.string(),
                                status: z.string(),
                                supplierName: z.string(),
                                invoiceNo: z.string().nullable(),
                                reasonLabel: z.string(),
                                raisedBy: z.string(),
                                raisedAt: z.string(),
                                sentAt: z.string().nullable(),
                                daysWaiting: z.number(),
                                lines: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, rows: await openReturns(req.locationId, range) };
        }
    );

    // ── The weekly and monthly lists ────────────────────────────────────────

    r.get(
        '/reports/purchase-list',
        {
            preHandler: managers(),
            schema: {
                querystring: rangeQuery,
                response: {
                    200: z.object({
                        from: z.string(),
                        to: z.string(),
                        summary: z.object({
                            deliveries: z.number(),
                            suppliers: z.number(),
                            lines: z.number(),
                            deliveriesWithReturns: z.number(),
                            ordersRaised: z.number()
                        }),
                        rows: z.array(
                            z.object({
                                supplierId: z.number(),
                                supplierName: z.string(),
                                itemId: z.number().nullable(),
                                code: z.string().nullable(),
                                name: z.string(),
                                unit: z.string().nullable(),
                                packName: z.string().nullable(),
                                qtyPacks: z.number(),
                                qtyBase: z.number(),
                                qtyPacksSentBack: z.number(),
                                deliveries: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, ...(await purchaseList(req.locationId, range)) };
        }
    );

    r.get(
        '/reports/section-requests',
        {
            preHandler: managers(),
            schema: {
                querystring: rangeQuery,
                response: {
                    200: z.object({
                        from: z.string(),
                        to: z.string(),
                        sections: z.array(
                            z.object({
                                sectionId: z.number(),
                                sectionName: z.string(),
                                requests: z.number(),
                                waiting: z.number(),
                                notConfirmed: z.number(),
                                cancelled: z.number(),
                                items: z.number(),
                                itemsShort: z.number()
                            })
                        ),
                        rows: z.array(
                            z.object({
                                sectionId: z.number(),
                                sectionName: z.string(),
                                itemId: z.number(),
                                code: z.string(),
                                name: z.string(),
                                stockUnit: z.string(),
                                requests: z.number(),
                                qtyAsked: z.number(),
                                qtySent: z.number(),
                                qtyConfirmed: z.number(),
                                qtyWaiting: z.number(),
                                qtyShort: z.number()
                            })
                        )
                    })
                }
            }
        },
        async (req) => {
            const range = resolveRange(req.query);
            return { ...range, ...(await sectionRequests(req.locationId, range)) };
        }
    );
}
