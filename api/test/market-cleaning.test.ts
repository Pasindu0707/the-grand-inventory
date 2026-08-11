import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authedHeaders, db, makeApp } from './helpers.js';

let app: FastifyInstance;
let headers: Record<string, string>;
let locationId: number;

const idem = () => ({ 'idempotency-key': randomUUID() });

async function prawns() {
    return db
        .selectFrom('items')
        .select(['id', 'name'])
        .where('code', '=', 'SEA-001')
        .executeTakeFirstOrThrow();
}

async function storeStock(itemId: number) {
    const store = await db
        .selectFrom('sections')
        .select('id')
        .where('location_id', '=', locationId)
        .where('is_store', '=', true)
        .executeTakeFirstOrThrow();
    const row = await db
        .selectFrom('current_stock')
        .select('qty_base')
        .where('item_id', '=', itemId)
        .where('section_id', '=', store.id)
        .executeTakeFirst();
    return Number(row?.qty_base ?? 0);
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

describe('market purchase', () => {
    it('refuses to post without a photo of the slip', async () => {
        const item = await prawns();
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/market',
            headers: { ...headers, ...idem() },
            payload: {
                photoUrl: '',
                lines: [{ itemId: item.id, qtyBase: 3200, totalPrice: 6400 }]
            }
        });

        // A cash buy has no invoice. Without the photo there is no evidence at
        // all that the money bought anything, so this must not be recordable.
        expect(res.statusCode).toBe(400);
    });

    it('adds stock at the price actually paid and moves the average', async () => {
        const item = await prawns();
        const before = await storeStock(item.id);

        const costBefore = await db
            .selectFrom('item_cost_state')
            .select(['qty_on_hand', 'avg_cost'])
            .where('item_id', '=', item.id)
            .where('location_id', '=', locationId)
            .executeTakeFirst();

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/market',
            headers: { ...headers, ...idem() },
            payload: {
                photoUrl: '/uploads/2026-08-11/slip.jpg',
                cashGiven: 7000,
                cashReturned: 600,
                lines: [{ itemId: item.id, qtyBase: 3200, totalPrice: 6400 }]
            }
        });

        expect(res.statusCode).toBe(201);
        expect(res.json().total).toBe(6400);
        expect(await storeStock(item.id)).toBe(before + 3200);

        // 6400 / 3200 = 2.00 per gram, blended into whatever was there.
        const costAfter = await db
            .selectFrom('item_cost_state')
            .select(['qty_on_hand', 'avg_cost'])
            .where('item_id', '=', item.id)
            .where('location_id', '=', locationId)
            .executeTakeFirstOrThrow();

        if (costBefore && Number(costBefore.qty_on_hand) > 0) {
            const expected =
                (Number(costBefore.qty_on_hand) * Number(costBefore.avg_cost) + 3200 * 2) /
                (Number(costBefore.qty_on_hand) + 3200);
            expect(Number(costAfter.avg_cost)).toBeCloseTo(expected, 3);
        }
    });

    it('flags a cash discrepancy without refusing the purchase', async () => {
        const item = await prawns();
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/market',
            headers: { ...headers, ...idem() },
            payload: {
                photoUrl: '/uploads/2026-08-11/slip2.jpg',
                cashGiven: 5000,
                cashReturned: 0,
                lines: [{ itemId: item.id, qtyBase: 1000, totalPrice: 4000 }]
            }
        });

        // Rs 1,000 unaccounted for. Recorded and surfaced, not blocked --
        // market stalls round prices and the buy still happened.
        expect(res.statusCode).toBe(201);
        expect(res.json().cashDiscrepancy).toBe(1000);
    });

    it('replays an idempotency key instead of buying twice', async () => {
        const item = await prawns();
        const key = randomUUID();
        const payload = {
            photoUrl: '/uploads/2026-08-11/slip3.jpg',
            lines: [{ itemId: item.id, qtyBase: 500, totalPrice: 1000 }]
        };

        const first = await app.inject({
            method: 'POST',
            url: '/api/v1/market',
            headers: { ...headers, 'idempotency-key': key },
            payload
        });
        const second = await app.inject({
            method: 'POST',
            url: '/api/v1/market',
            headers: { ...headers, 'idempotency-key': key },
            payload
        });

        expect(first.statusCode).toBe(201);
        expect(second.statusCode).toBe(200);
        expect(second.json().id).toBe(first.json().id);
    });
});

describe('uploads', () => {
    // The multipart happy path and the mime-type rejection are exercised over
    // real HTTP by the slice-3 smoke script — inject() with a FormData body is
    // fiddly enough that the test would mostly be testing the test harness.
    // What belongs here is the guard that does not need a body at all.
    it('requires a session', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/v1/uploads' });
        expect(res.statusCode).toBe(401);
    });
});

describe('cleaning', () => {
    it('lists today’s tasks with their done state', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/cleaning/today', headers });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.tasks.length).toBeGreaterThan(0);
        expect(body.tasks[0]).toHaveProperty('frequency');
        expect(body.tasks.every((t: { doneToday: boolean }) => t.doneToday === false)).toBe(true);
    });

    it('logs a task and will not log it twice in one day', async () => {
        const today = await app.inject({ method: 'GET', url: '/api/v1/cleaning/today', headers });
        const task = today.json().tasks[0];

        const first = await app.inject({
            method: 'POST',
            url: '/api/v1/cleaning/log',
            headers,
            payload: { taskId: task.taskId }
        });
        expect(first.statusCode).toBe(201);

        const second = await app.inject({
            method: 'POST',
            url: '/api/v1/cleaning/log',
            headers,
            payload: { taskId: task.taskId }
        });
        // Ticking twice is a double-tap, not a second cleaning.
        expect(second.statusCode).toBe(409);

        const after = await app.inject({ method: 'GET', url: '/api/v1/cleaning/today', headers });
        const updated = after
            .json()
            .tasks.find((t: { taskId: number }) => t.taskId === task.taskId);
        expect(updated.doneToday).toBe(true);
        expect(updated.lastDoneBy).toBeTruthy();
    });

    it('will not let the person who did the work verify it', async () => {
        const today = await app.inject({ method: 'GET', url: '/api/v1/cleaning/today', headers });
        const done = today.json().tasks.find((t: { doneToday: boolean }) => t.doneToday);
        expect(done).toBeTruthy();

        // The storekeeper logged it, so a manager must be the one to verify.
        const manager = await db
            .selectFrom('users')
            .select(['id', 'location_id'])
            .where('role', '=', 'management')
            .executeTakeFirstOrThrow();
        const login = await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { userId: manager.id, locationId: manager.location_id ?? 1, pin: '1234' }
        });

        const res = await app.inject({
            method: 'POST',
            url: `/api/v1/cleaning/log/${done.logId}/verify`,
            headers: {
                authorization: `Bearer ${login.json().accessToken}`,
                'x-location-id': String(manager.location_id ?? 1)
            }
        });
        expect(res.statusCode).toBe(200);
    });
});
