/**
 * Session state.
 *
 * Kept from the POS template's shape (signals + localStorage) because it works;
 * the contents are The Grand's. Gone: tenant branding, subscription plan and
 * feature gating — a single restaurant group has no upgrade tiers, and leaving
 * that machinery in place means every new screen has to reason about it.
 *
 * Added: the active location. Owners and managers move between outlets inside
 * one session, so it is session state rather than a fixed property of the user.
 */
import { Injectable, computed, signal } from '@angular/core';
import type { ActiveLocation, LocationRef, Role, RouteKey, Section, SessionResponse, SessionUser } from './types';

const STORAGE_KEY = 'grand-session';

interface AuthState {
    accessToken: string | null;
    refreshToken: string | null;
    user: SessionUser | null;
    location: ActiveLocation | null;
    locations: LocationRef[];
    sections: Section[];
}

const EMPTY: AuthState = {
    accessToken: null,
    refreshToken: null,
    user: null,
    location: null,
    locations: [],
    sections: []
};

function load(): AuthState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...EMPTY, ...JSON.parse(raw) };
    } catch {
        /* a corrupt session is just a signed-out session */
    }
    return { ...EMPTY };
}

/**
 * Who may open what.
 *
 * Section roles get the screens they actually use. The storekeeper is the only
 * role that receives deliveries; the owner reads everything and writes little.
 */
export const ROUTE_PERMISSIONS: Record<RouteKey, Role[]> = {
    today: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker', 'cleaning', 'purchasing'],
    grn: ['owner', 'manager', 'storekeeper', 'purchasing'],
    market: ['owner', 'manager', 'storekeeper', 'purchasing'],
    cleaning: ['owner', 'manager', 'cleaning', 'storekeeper', 'chef', 'bar', 'baker'],
    stock: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker'],
    // Sections request, the storekeeper fulfils — both live on the same screen.
    issues: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker', 'cleaning'],
    wastage: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker'],
    counts: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker'],
    items: ['owner', 'manager', 'purchasing'],
    reports: ['owner', 'manager']
};

export function canAccess(role: Role | undefined | null, allowed: Role[]): boolean {
    return !!role && allowed.includes(role);
}

export function canUseRoute(role: Role | null, routeKey: RouteKey): boolean {
    return canAccess(role, ROUTE_PERMISSIONS[routeKey]);
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
    private state = signal<AuthState>(load());

    readonly accessToken = computed(() => this.state().accessToken);
    readonly refreshToken = computed(() => this.state().refreshToken);
    readonly user = computed(() => this.state().user);
    readonly location = computed(() => this.state().location);
    readonly locations = computed(() => this.state().locations);
    readonly sections = computed(() => this.state().sections);
    readonly isAuthenticated = computed(() => !!this.state().accessToken);
    readonly role = computed<Role | null>(() => this.state().user?.role ?? null);
    readonly locationId = computed<number | null>(() => this.state().location?.id ?? null);

    /** The main store section for the active location, if it has one. */
    readonly storeSection = computed(() => this.state().sections.find((s) => s.isStore) ?? null);

    private persist(s: AuthState): void {
        this.state.set(s);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        } catch {
            /* private browsing; the session simply will not survive a reload */
        }
    }

    setSession(res: SessionResponse): void {
        this.persist({
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            user: res.user,
            location: res.location,
            locations: res.locations,
            sections: res.sections
        });
    }

    setTokens(access: string, refresh: string): void {
        this.persist({ ...this.state(), accessToken: access, refreshToken: refresh });
    }

    setActiveLocation(location: ActiveLocation, sections: Section[]): void {
        this.persist({ ...this.state(), location, sections });
    }

    clearSession(): void {
        this.persist({ ...EMPTY });
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }

    canUseRoute(routeKey: RouteKey): boolean {
        return canUseRoute(this.role(), routeKey);
    }
}
