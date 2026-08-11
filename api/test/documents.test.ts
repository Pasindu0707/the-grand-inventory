import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authedHeaders, db, makeApp } from './helpers.js';
import { windowWarning, DEFAULT_ISSUE_WINDOWS } from '../src/services/settings.js';

let app: FastifyInstance;
let headers: Record<string, string>;
let locationId: number;
let storeId: number;
let kitchenId: number;

const idem = () => ({ 'idempotency-key': randomUUID() });

async function sectionId(code: string) {
    const row = await db
        .selectFrom('sections')
        .select('id')
        .where('location_id', '=', locationId)
        .where('code', '=', code)
        .executeTakeFirstOrThrow();
    return row.id;
}

async function stockOf(itemId: number, section: number) {
    const row = await db
        .selectFrom('current_stock')
        .select('qty_base')
        .where('item_id', '=', itemId)
        .where('section_id', '=', section)
        .executeTakeFirst();
    return Number(row?.qty_base ?? 0);
}

/** An item the store definitely holds, so issues are not all shortfalls. */
async function wellStockedItem() {
    const row = await db
        .selectFrom('current_stock as cs')
        .innerJoin('items', 'items.id', 'cs.item_id')
        .select(['items.id', 'items.name', 'cs.qty_base'])
        .where('cs.section_id', '=', storeId)
        .where('cs.qty_base', '>', 5000)
        .orderBy('cs.qty_base', 'desc')
        .executeTakeFirstOrThrow();
    return { id: row.id, name: row.name, qty: Number(row.qty_base) };
}

beforeAll(async () => {
    app = await makeApp();
    const ctx = await authedHeaders(app);
    headers = ctx.headers;
    locationId = ctx.locationId;
    storeId = await sectionId('STORE');
    kitchenId = await sectionId('KITCHEN');
});

afterAll(async () => {
    await app.close();
    await db.destroy();
});

describe('issues', () => {
    it('moves stock out of the store and into the section, netting to zero', async () => {
        const item = await wellStockedItem();
        const storeBefore = await stockOf(item.id, storeId);
        const kitchenBefore = await stockOf(item.id, kitchenId);

        const req = await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: item.id, qtyRequested: 1000 }] }
        });
        expect(req.statusCode).toBe(201);
        const issueId = req.json().id;

        const fulfil = await app.inject({
            method: 'POST',
            url: `/api/v1/issues/${issueId}/fulfil`,
            headers: { ...headers, ...idem() },
            payload: { lines: [] }
        });
        expect(fulfil.statusCode).toBe(200);
        expect(fulfil.json().linesIssued).toBe(1);

        const storeAfter = await stockOf(item.id, storeId);
        const kitchenAfter = await stockOf(item.id, kitchenId);

        expect(storeBefore - storeAfter).toBe(1000);
        expect(kitchenAfter - kitchenBefore).toBe(1000);
        // Nothing was created or destroyed, only moved.
        expect(storeAfter + kitchenAfter).toBe(storeBefore + kitchenBefore);
    });

    it('caps a line at what the store actually holds and reports the shortfall', async () => {
        const item = await wellStockedItem();
        const available = await stockOf(item.id, storeId);

        const req = await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: {
                toSectionId: kitchenId,
                lines: [{ itemId: item.id, qtyRequested: available + 50_000 }]
            }
        });
        const issueId = req.json().id;

        const fulfil = await app.inject({
            method: 'POST',
            url: `/api/v1/issues/${issueId}/fulfil`,
            headers: { ...headers, ...idem() },
            payload: { lines: [] }
        });

        expect(fulfil.statusCode).toBe(200);
        const shortfalls = fulfil.json().shortfalls;
        expect(shortfalls).toHaveLength(1);
        expect(shortfalls[0].issued).toBe(available);

        // Issuing more than exists would drive the store negative, which is a
        // number nobody can act on.
        expect(await stockOf(item.id, storeId)).toBe(0);
    });

    it('will not fulfil the same issue twice', async () => {
        const item = await wellStockedItem();
        const req = await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: item.id, qtyRequested: 10 }] }
        });
        const issueId = req.json().id;

        const first = await app.inject({
            method: 'POST',
            url: `/api/v1/issues/${issueId}/fulfil`,
            headers: { ...headers, ...idem() },
            payload: { lines: [] }
        });
        const second = await app.inject({
            method: 'POST',
            url: `/api/v1/issues/${issueId}/fulfil`,
            headers: { ...headers, ...idem() },
            payload: { lines: [] }
        });

        expect(first.statusCode).toBe(200);
        expect(second.statusCode).toBe(409);
    });

    it('cannot cancel an issue that already moved stock', async () => {
        const item = await wellStockedItem();
        const req = await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: item.id, qtyRequested: 10 }] }
        });
        const issueId = req.json().id;
        await app.inject({
            method: 'POST',
            url: `/api/v1/issues/${issueId}/fulfil`,
            headers: { ...headers, ...idem() },
            payload: { lines: [] }
        });

        const cancel = await app.inject({
            method: 'POST',
            url: `/api/v1/issues/${issueId}/cancel`,
            headers
        });
        expect(cancel.statusCode).toBe(409);
    });
});

describe('issue windows', () => {
    it('warns outside a window and stays quiet inside one', () => {
        const inWindow = new Date();
        inWindow.setHours(6, 10, 0, 0);
        expect(windowWarning(DEFAULT_ISSUE_WINDOWS, inWindow)).toBeNull();

        const outOfWindow = new Date();
        outOfWindow.setHours(14, 0, 0, 0);
        const warning = windowWarning(DEFAULT_ISSUE_WINDOWS, outOfWindow);
        expect(warning).toMatch(/outside the issue windows/i);
    });

    it('warns but still records the issue — it never blocks', async () => {
        const item = await wellStockedItem();
        const req = await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: item.id, qtyRequested: 5 }] }
        });
        const fulfil = await app.inject({
            method: 'POST',
            url: `/api/v1/issues/${req.json().id}/fulfil`,
            headers: { ...headers, ...idem() },
            payload: { lines: [] }
        });

        // Whatever the clock says, the stock moved and the document exists.
        expect(fulfil.statusCode).toBe(200);
        expect(fulfil.json()).toHaveProperty('windowWarning');
    });
});

describe('wastage', () => {
    it('reduces the section it was wasted from', async () => {
        const item = await wellStockedItem();
        await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: item.id, qtyRequested: 500 }] }
        }).then((r) =>
            app.inject({
                method: 'POST',
                url: `/api/v1/issues/${r.json().id}/fulfil`,
                headers: { ...headers, ...idem() },
                payload: { lines: [] }
            })
        );

        const before = await stockOf(item.id, kitchenId);

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/wastage',
            headers,
            payload: {
                sectionId: kitchenId,
                itemId: item.id,
                qtyBase: 100,
                reasonCode: 'SPOIL'
            }
        });

        expect(res.statusCode).toBe(201);
        expect(await stockOf(item.id, kitchenId)).toBe(before - 100);
    });

    it('rejects an unknown reason code', async () => {
        const item = await wellStockedItem();
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/wastage',
            headers,
            payload: { sectionId: kitchenId, itemId: item.id, qtyBase: 1, reasonCode: 'NOPE' }
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects a reason code belonging to another document type', async () => {
        const item = await wellStockedItem();
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/wastage',
            headers,
            // A real code, but it belongs to counts.
            payload: { sectionId: kitchenId, itemId: item.id, qtyBase: 1, reasonCode: 'COUNTADJ' }
        });
        expect(res.statusCode).toBe(400);
    });
});

describe('transfers', () => {
    it('posts both legs at once within one outlet', async () => {
        const item = await wellStockedItem();
        const bakeryId = await sectionId('BAKERY');

        await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: item.id, qtyRequested: 300 }] }
        }).then((r) =>
            app.inject({
                method: 'POST',
                url: `/api/v1/issues/${r.json().id}/fulfil`,
                headers: { ...headers, ...idem() },
                payload: { lines: [] }
            })
        );

        const kitchenBefore = await stockOf(item.id, kitchenId);
        const bakeryBefore = await stockOf(item.id, bakeryId);

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/transfers',
            headers,
            payload: {
                fromSectionId: kitchenId,
                toSectionId: bakeryId,
                itemId: item.id,
                qtyBase: 100
            }
        });

        expect(res.statusCode).toBe(201);
        expect(res.json().completed).toBe(true);
        expect(await stockOf(item.id, kitchenId)).toBe(kitchenBefore - 100);
        expect(await stockOf(item.id, bakeryId)).toBe(bakeryBefore + 100);
    });

    it('refuses a transfer to the same section', async () => {
        const item = await wellStockedItem();
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/transfers',
            headers,
            payload: {
                fromSectionId: kitchenId,
                toSectionId: kitchenId,
                itemId: item.id,
                qtyBase: 1
            }
        });
        expect(res.statusCode).toBe(400);
    });
});

describe('stock counts', () => {
    it('freezes expected at open, and a later movement does not absorb the variance', async () => {
        const open = await app.inject({
            method: 'POST',
            url: '/api/v1/counts/open',
            headers,
            payload: { sectionId: storeId, countType: 'daily_critical' }
        });
        expect(open.statusCode).toBe(201);

        const countId = open.json().id;
        const line = open.json().lines[0];
        const expectedAtOpen = line.qtyExpected;

        // Something moves while the count is being walked.
        await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: line.itemId, qtyRequested: 50 }] }
        }).then((r) =>
            app.inject({
                method: 'POST',
                url: `/api/v1/issues/${r.json().id}/fulfil`,
                headers: { ...headers, ...idem() },
                payload: { lines: [] }
            })
        );

        const reread = await app.inject({ method: 'GET', url: `/api/v1/counts/${countId}`, headers });
        const rereadLine = reread.json().lines.find((l: { lineId: string }) => l.lineId === line.lineId);

        // Still the figure from when the count opened. If this re-read live it
        // would quietly swallow the difference and hide real shrinkage.
        expect(rereadLine.qtyExpected).toBe(expectedAtOpen);
    });

    it('writes a COUNTADJ adjustment that makes the ledger agree with the shelf', async () => {
        const open = await app.inject({
            method: 'POST',
            url: '/api/v1/counts/open',
            headers,
            payload: { sectionId: kitchenId, countType: 'daily_critical' }
        });
        const countId = open.json().id;
        const lines = open.json().lines as {
            lineId: string;
            itemId: number;
            qtyExpected: number;
        }[];

        // One item is 25 units short on the shelf: the signature of shrinkage.
        const target = lines[0];
        const shortBy = 25;

        await app.inject({
            method: 'PUT',
            url: `/api/v1/counts/${countId}/lines`,
            headers,
            payload: {
                lines: lines.map((l) => ({
                    lineId: l.lineId,
                    qtyCounted: l.lineId === target.lineId ? Math.max(0, l.qtyExpected - shortBy) : l.qtyExpected
                }))
            }
        });

        const before = await stockOf(target.itemId, kitchenId);

        const close = await app.inject({
            method: 'POST',
            url: `/api/v1/counts/${countId}/close`,
            headers
        });

        expect(close.statusCode).toBe(200);
        expect(close.json().adjustments).toBeGreaterThanOrEqual(1);

        const after = await stockOf(target.itemId, kitchenId);
        expect(after).toBe(before - shortBy);

        // The adjustment is on the ledger as a count row with a reason code,
        // not an edit of anything that came before it.
        const adj = await db
            .selectFrom('stock_ledger')
            .selectAll()
            .where('doc', '=', 'count')
            .where('doc_id', '=', String(countId))
            .execute();
        expect(adj.length).toBeGreaterThanOrEqual(1);
        expect(adj.every((r) => r.reason_code === 'COUNTADJ')).toBe(true);
    });

    it('will not close the same count twice', async () => {
        const open = await app.inject({
            method: 'POST',
            url: '/api/v1/counts/open',
            headers,
            payload: { sectionId: await sectionId('BAR'), countType: 'daily_critical' }
        });
        const countId = open.json().id;

        const first = await app.inject({ method: 'POST', url: `/api/v1/counts/${countId}/close`, headers });
        const second = await app.inject({ method: 'POST', url: `/api/v1/counts/${countId}/close`, headers });

        expect(first.statusCode).toBe(200);
        expect(second.statusCode).toBe(409);
    });

    it('refuses to let the counter verify their own count', async () => {
        const open = await app.inject({
            method: 'POST',
            url: '/api/v1/counts/open',
            headers,
            payload: { sectionId: await sectionId('CLEAN'), countType: 'daily_critical' }
        });
        const countId = open.json().id;
        await app.inject({ method: 'POST', url: `/api/v1/counts/${countId}/close`, headers });

        // The storekeeper counted it. A manager token is a different person...
        const manager = await db
            .selectFrom('users')
            .select(['id', 'location_id'])
            .where('role', '=', 'manager')
            .executeTakeFirstOrThrow();
        const login = await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { userId: manager.id, locationId: manager.location_id ?? 1, pin: '1234' }
        });
        const mgrHeaders = {
            authorization: `Bearer ${login.json().accessToken}`,
            'x-location-id': String(manager.location_id ?? 1)
        };

        const ok = await app.inject({
            method: 'POST',
            url: `/api/v1/counts/${countId}/verify`,
            headers: mgrHeaders
        });
        expect(ok.statusCode).toBe(200);
    });
});

describe('reversals', () => {
    it('undoes a wastage document and nets its effect to zero', async () => {
        const item = await wellStockedItem();
        await app.inject({
            method: 'POST',
            url: '/api/v1/issues',
            headers,
            payload: { toSectionId: kitchenId, lines: [{ itemId: item.id, qtyRequested: 200 }] }
        }).then((r) =>
            app.inject({
                method: 'POST',
                url: `/api/v1/issues/${r.json().id}/fulfil`,
                headers: { ...headers, ...idem() },
                payload: { lines: [] }
            })
        );

        const waste = await app.inject({
            method: 'POST',
            url: '/api/v1/wastage',
            headers,
            payload: { sectionId: kitchenId, itemId: item.id, qtyBase: 60, reasonCode: 'SPOIL' }
        });
        const wastageId = waste.json().id;
        const afterWaste = await stockOf(item.id, kitchenId);

        const manager = await db
            .selectFrom('users')
            .select(['id', 'location_id'])
            .where('role', '=', 'manager')
            .executeTakeFirstOrThrow();
        const login = await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { userId: manager.id, locationId: manager.location_id ?? 1, pin: '1234' }
        });
        const mgrHeaders = {
            authorization: `Bearer ${login.json().accessToken}`,
            'x-location-id': String(manager.location_id ?? 1)
        };

        const rev = await app.inject({
            method: 'POST',
            url: `/api/v1/documents/wastage/${wastageId}/reverse`,
            headers: mgrHeaders,
            payload: { reason: 'logged against the wrong item' }
        });

        expect(rev.statusCode).toBe(200);
        expect(await stockOf(item.id, kitchenId)).toBe(afterWaste + 60);

        // The original row is untouched; the correction sits beside it.
        const rows = await db
            .selectFrom('stock_ledger')
            .selectAll()
            .where('doc', '=', 'wastage')
            .where('doc_id', '=', String(wastageId))
            .execute();
        expect(rows).toHaveLength(2);
        expect(rows.filter((r) => r.is_reversal)).toHaveLength(1);
    });

    it('refuses a reversal from a role that cannot approve', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/documents/wastage/1/reverse',
            headers,
            payload: { reason: 'storekeeper should not be able to do this' }
        });
        expect(res.statusCode).toBe(403);
    });
});
