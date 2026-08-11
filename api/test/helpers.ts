import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/index.js';

export const DEMO_PIN = '1234';

export async function makeApp(): Promise<FastifyInstance> {
    const app = await buildApp();
    await app.ready();
    return app;
}

/** The seeded storekeeper at the Gastrobar — the person who receives deliveries. */
export async function storekeeper() {
    return db
        .selectFrom('users')
        .select(['id', 'name', 'role', 'location_id'])
        .where('role', '=', 'storekeeper')
        .where('is_active', '=', true)
        .orderBy('id')
        .executeTakeFirstOrThrow();
}

export async function login(app: FastifyInstance, userId: number, locationId: number, pin = DEMO_PIN) {
    const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { userId, locationId, pin },
    });
    return { status: res.statusCode, body: res.json() };
}

export async function authedHeaders(app: FastifyInstance) {
    const user = await storekeeper();
    const locationId = user.location_id ?? 1;
    const { body } = await login(app, user.id, locationId);
    return {
        user,
        locationId,
        headers: {
            authorization: `Bearer ${body.accessToken}`,
            'x-location-id': String(locationId),
        },
    };
}

/** Clears lockout state so one test's failures do not leak into another. */
export async function clearLoginAttempts(userId: number) {
    await db.deleteFrom('login_attempts').where('user_id', '=', userId).execute();
}

export async function ledgerRowsFor(doc: string, docId: string) {
    return db
        .selectFrom('stock_ledger')
        .selectAll()
        .where('doc', '=', doc as 'grn')
        .where('doc_id', '=', docId)
        .orderBy('id')
        .execute();
}

export { db };
