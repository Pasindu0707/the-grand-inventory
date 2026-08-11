import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { db } from '../db/index.js';
import { forbidden, unauthorized } from '../errors.js';
import type { UserRole } from '../db/types.js';

export interface AccessClaims {
    sub: number;
    name: string;
    role: UserRole;
    /** Home location. Null for group-wide roles (owner). */
    homeLocationId: number | null;
    /** Locations this user may act in. Owner gets every active location. */
    locations: number[];
    typ: 'access' | 'refresh';
}

declare module 'fastify' {
    interface FastifyRequest {
        /** Populated by `authenticate`. */
        user: AccessClaims;
        /**
         * The location this request acts on, from the x-location-id header,
         * already checked against the token's allowed set.
         */
        locationId: number;
    }
    interface FastifyInstance {
        authenticate: (req: FastifyRequest) => Promise<void>;
        requireRole: (...roles: UserRole[]) => (req: FastifyRequest) => Promise<void>;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: AccessClaims;
        user: AccessClaims;
    }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
    /**
     * Verifies the bearer token and resolves the active location.
     *
     * The location comes from a header rather than the token because owners and
     * managers move between outlets within one session. It is never trusted as
     * given -- it has to be in the set the token was issued with, which is what
     * stops a chef at the Gastrobar reading the Coffee Lounge's stock by
     * editing a header.
     */
    app.decorate('authenticate', async (req: FastifyRequest) => {
        try {
            await req.jwtVerify();
        } catch {
            throw unauthorized('Session expired, sign in again');
        }

        if (req.user.typ !== 'access') {
            throw unauthorized('Wrong token type');
        }

        const header = req.headers['x-location-id'];
        const requested = header ? Number(Array.isArray(header) ? header[0] : header) : NaN;

        if (Number.isFinite(requested)) {
            if (!req.user.locations.includes(requested)) {
                throw forbidden('You do not have access to that location');
            }
            req.locationId = requested;
        } else {
            const fallback = req.user.homeLocationId ?? req.user.locations[0];
            if (fallback === undefined) throw forbidden('No location available for this user');
            req.locationId = fallback;
        }
    });

    app.decorate('requireRole', (...roles: UserRole[]) => async (req: FastifyRequest) => {
        await app.authenticate(req);
        if (!roles.includes(req.user.role)) {
            throw forbidden(`This action needs one of: ${roles.join(', ')}`);
        }
    });
});

/** Locations a user may act in. Group-wide users get all active ones. */
export async function locationsForUser(
    userId: number,
    homeLocationId: number | null
): Promise<number[]> {
    if (homeLocationId !== null) return [homeLocationId];
    const rows = await db
        .selectFrom('locations')
        .select('id')
        .where('is_active', '=', true)
        .execute();
    return rows.map((r) => r.id);
}

/**
 * Which section a role speaks for.
 *
 * A kitchen login at any branch draws from and answers for that branch's
 * KITCHEN section. Management and admin see everything, so they are not tied to
 * one. This is what lets "confirm it arrived" be restricted to the people who
 * actually asked.
 */
const ROLE_SECTIONS: Record<UserRole, string[] | 'all'> = {
    admin: 'all',
    management: 'all',
    storekeeper: 'all',
    kitchen: ['KITCHEN', 'BAKERY', 'BAR'],
    cleaning: ['CLEAN']
};

export async function sectionsForUser(role: UserRole, locationId: number): Promise<number[]> {
    const codes = ROLE_SECTIONS[role];
    let q = db.selectFrom('sections').select('id').where('location_id', '=', locationId);
    if (codes !== 'all') q = q.where('code', 'in', codes);
    return (await q.execute()).map((r) => r.id);
}

/** The one section a role primarily works out of, for defaults in the UI. */
export async function homeSectionFor(
    role: UserRole,
    locationId: number
): Promise<number | null> {
    const code =
        role === 'cleaning' ? 'CLEAN' : role === 'kitchen' ? 'KITCHEN' : 'STORE';
    const row = await db
        .selectFrom('sections')
        .select('id')
        .where('location_id', '=', locationId)
        .where('code', '=', code)
        .executeTakeFirst();
    return row?.id ?? null;
}
