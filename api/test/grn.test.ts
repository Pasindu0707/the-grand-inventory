import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authedHeaders, db, ledgerRowsFor, makeApp } from './helpers.js';

let app: FastifyInstance;
let headers: Record<string, string>;
let locationId: number;

/** Sunflower oil: 20 L can, so 1 pack = 20,000 ml. */
async function oilPack() {
    return db
        .selectFrom('item_packs')
        .innerJoin('items', 'items.id', 'item_packs.item_id')
        .select([
            'item_packs.id as packId',
            'item_packs.item_id as itemId',
            'item_packs.qty_in_stock_unit as qtyInStockUnit',
        ])
        .where('items.code', '=', 'DRY-022')
        .executeTakeFirstOrThrow();
}

async function stockOf(itemId: number, sectionId: number) {
    const row = await db
        .selectFrom('current_stock')
        .select('qty_base')
        .where('item_id', '=', itemId)
        .where('section_id', '=', sectionId)
        .executeTakeFirst();
    return Number(row?.qty_base ?? 0);
}

async function storeSection(loc: number) {
    return db
        .selectFrom('sections')
        .select('id')
        .where('location_id', '=', loc)
        .where('is_store', '=', true)
        .executeTakeFirstOrThrow();
}

beforeAll(async () => {
    app = await makeApp();
    const ctx = await authedHeaders(app);
    headers = ctx.headers;
    locationId = ctx.locationId;
});

afterAll(async () => {
    await app.close();
    await db.destroy();
});

describe('POST /grn', () => {
    it('converts packs to stock units exactly once and lands them in the store', async () => {
        const pack = await oilPack();
        const store = await storeSection(locationId);
        const before = await stockOf(pack.itemId, store.id);

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...headers, 'idempotency-key': randomUUID() },
            payload: {
                supplierId: 1,
                invoiceNo: 'INV-TEST-1',
                lines: [{ itemPackId: pack.packId, qtyPacks: 3 }],
            },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();

        const after = await stockOf(pack.itemId, store.id);
        // 3 packs x 20,000 ml. The user typed "3", never "60000".
        expect(after - before).toBe(3 * Number(pack.qtyInStockUnit));

        const rows = await ledgerRowsFor('grn', body.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.section_id).toBe(store.id);
        expect(Number(rows[0]!.qty_base)).toBe(60000);
    });

    it('replaying an Idempotency-Key creates exactly one GRN', async () => {
        const pack = await oilPack();
        const key = randomUUID();
        // Unique per run: a GRN cannot be deleted afterwards, so a fixed
        // invoice number made this test pass exactly once per database.
        const invoiceNo = `INV-REPLAY-${randomUUID().slice(0, 8)}`;
        const payload = {
            supplierId: 1,
            invoiceNo,
            lines: [{ itemPackId: pack.packId, qtyPacks: 1 }],
        };

        const first = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...headers, 'idempotency-key': key },
            payload,
        });
        const second = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...headers, 'idempotency-key': key },
            payload,
        });

        expect(first.statusCode).toBe(201);
        expect(second.statusCode).toBe(200);
        expect(second.json().id).toBe(first.json().id);

        const count = await db
            .selectFrom('grn')
            .select(({ fn }) => fn.countAll().as('n'))
            .where('invoice_no', '=', invoiceNo)
            .executeTakeFirstOrThrow();
        expect(Number(count.n)).toBe(1);

        const rows = await ledgerRowsFor('grn', first.json().id);
        expect(rows).toHaveLength(1);
    });

    it('rejects the same key with a different body rather than guessing', async () => {
        const pack = await oilPack();
        const key = randomUUID();

        await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...headers, 'idempotency-key': key },
            payload: {
                supplierId: 1,
                lines: [{ itemPackId: pack.packId, qtyPacks: 1 }],
            },
        });

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...headers, 'idempotency-key': key },
            payload: {
                supplierId: 1,
                lines: [{ itemPackId: pack.packId, qtyPacks: 99 }],
            },
        });

        expect(res.statusCode).toBe(409);
    });

    it('refuses a role that has no business receiving deliveries', async () => {
        const cleaner = await db
            .selectFrom('users')
            .select(['id', 'location_id'])
            .where('role', '=', 'cleaning')
            .executeTakeFirst();

        if (!cleaner) return;

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { userId: cleaner.id, locationId: cleaner.location_id ?? 1, pin: '1234' },
        });
        const token = res.json().accessToken;

        const grn = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: {
                authorization: `Bearer ${token}`,
                'x-location-id': String(cleaner.location_id ?? 1),
                'idempotency-key': randomUUID(),
            },
            payload: { supplierId: 1, lines: [{ itemPackId: 1, qtyPacks: 1 }] },
        });

        expect(grn.statusCode).toBe(403);
    });
});

describe('GET /stock', () => {
    it('derives quantities from the ledger', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/stock', headers });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.items.length).toBeGreaterThan(0);

        const row = body.items[0];
        expect(row).toHaveProperty('belowReorder');
        expect(row).not.toHaveProperty('value');
    });

    it('filters to items below their reorder point', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/v1/stock?belowReorder=true',
            headers,
        });
        expect(res.statusCode).toBe(200);
        for (const row of res.json().items) {
            expect(row.qtyBase).toBeLessThan(row.reorderPoint);
        }
    });
});

describe('reading a delivery back', () => {
    /**
     * A delivery is a document the business keeps, so it has to be findable
     * after the fact. Until the Deliveries screen existed the only route back
     * to one was the picker inside the supplier-return form.
     */
    it('lists a delivery and reads it back line by line', async () => {
        const pack = await oilPack();

        const created = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...headers, 'idempotency-key': randomUUID() },
            payload: {
                supplierId: 1,
                invoiceNo: `INV-READBACK-${Date.now().toString().slice(-6)}`,
                lines: [{ itemPackId: pack.packId, qtyPacks: 3 }],
            },
        });
        expect(created.statusCode).toBe(201);
        const id = created.json().id;

        const detail = await app.inject({
            method: 'GET',
            url: `/api/v1/grn/${id}`,
            headers,
        });
        expect(detail.statusCode).toBe(200);

        const body = detail.json();
        expect(body.id).toBe(String(id));
        expect(body.receivedBy).toBeTruthy();
        expect(body.lines).toHaveLength(1);

        const line = body.lines[0];
        expect(line.qtyPacks).toBe(3);
        // The conversion the storekeeper never types: 3 x 20 L can.
        expect(line.qtyBase).toBe(3 * Number(pack.qtyInStockUnit));
        // Nothing has gone back against a delivery made a moment ago.
        expect(line.qtyPacksReturned).toBe(0);

        // And it is on the list, findable by its invoice number.
        const found = await app.inject({
            method: 'GET',
            url: `/api/v1/grn?search=${encodeURIComponent(body.invoiceNo)}`,
            headers,
        });
        expect(found.statusCode).toBe(200);
        expect(found.json().items.some((r: { id: string }) => r.id === String(id))).toBe(true);
    });

    it('will not read a delivery from another branch', async () => {
        const other = await db
            .selectFrom('grn')
            .select('id')
            .where('location_id', '!=', locationId)
            .executeTakeFirst();

        // Only meaningful when another branch actually has one.
        if (!other) return;

        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/grn/${other.id}`,
            headers,
        });
        expect(res.statusCode).toBe(404);
    });
});
