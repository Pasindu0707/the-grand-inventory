/** Auth/session store + role & feature gating (FRONTEND_DOCUMENTATION.md §3.1, §5). */
import { Injectable, signal, computed } from '@angular/core';
import type {
    AuthBranch,
    AuthConfig,
    AuthResponse,
    AuthUser,
    FeatureKey,
    PlanSummary,
    Role,
    RouteKey,
    TenantBranding
} from '../core/types';
import { NAV_FEATURE_REQUIREMENTS } from '../core/features';

const STORAGE_KEY = 'pos-auth';

interface AuthState {
    accessToken: string | null;
    refreshToken: string | null;
    user: AuthUser | null;
    tenant: TenantBranding | null;
    branch: AuthBranch | null;
    config: AuthConfig | null;
    plan: PlanSummary | null;
}

const EMPTY: AuthState = {
    accessToken: null,
    refreshToken: null,
    user: null,
    tenant: null,
    branch: null,
    config: null,
    plan: null
};

function load(): AuthState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...EMPTY, ...JSON.parse(raw) };
    } catch {
        /* ignore */
    }
    return { ...EMPTY };
}

// ── Route permission map ────────────────────────────────────────────────────
export const ROUTE_PERMISSIONS: Record<RouteKey, Role[]> = {
    register: ['OWNER', 'MANAGER', 'CASHIER'],
    transactions: ['OWNER', 'MANAGER', 'CASHIER'],
    customers: ['OWNER', 'MANAGER', 'CASHIER'],
    inventory: ['OWNER', 'MANAGER'],
    discounts: ['OWNER', 'MANAGER'],
    branches: ['OWNER'],
    stock: ['OWNER', 'MANAGER'],
    'gift-cards': ['OWNER', 'MANAGER'],
    employees: ['OWNER'],
    reports: ['OWNER', 'MANAGER'],
    'sync-audit': ['OWNER', 'MANAGER']
};

export function canAccess(role: Role | undefined | null, allowed: Role[]): boolean {
    return !!role && allowed.includes(role);
}

export function hasFeature(plan: PlanSummary | null, key: FeatureKey): boolean {
    return !!plan && plan.features.includes(key);
}

export function canUseRoute(role: Role | null, plan: PlanSummary | null, routeKey: RouteKey): boolean {
    if (!canAccess(role, ROUTE_PERMISSIONS[routeKey])) return false;
    const required = NAV_FEATURE_REQUIREMENTS[routeKey];
    if (required && !hasFeature(plan, required)) return false;
    return true;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
    private state = signal<AuthState>(load());

    readonly accessToken = computed(() => this.state().accessToken);
    readonly refreshToken = computed(() => this.state().refreshToken);
    readonly user = computed(() => this.state().user);
    readonly tenant = computed(() => this.state().tenant);
    readonly branch = computed(() => this.state().branch);
    readonly config = computed(() => this.state().config);
    readonly plan = computed(() => this.state().plan);
    readonly isAuthenticated = computed(() => !!this.state().accessToken);
    readonly role = computed<Role | null>(() => this.state().user?.role ?? null);

    private persist(s: AuthState): void {
        this.state.set(s);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        } catch {
            /* ignore */
        }
    }

    setSession(response: AuthResponse): void {
        this.persist({
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            user: response.user,
            tenant: response.tenant,
            branch: response.branch,
            config: response.config,
            plan: response.plan
        });
    }

    setTokens(access: string, refresh: string): void {
        this.persist({ ...this.state(), accessToken: access, refreshToken: refresh });
    }

    setBranch(branch: AuthBranch): void {
        this.persist({ ...this.state(), branch });
    }

    clearSession(): void {
        this.persist({ ...EMPTY });
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }

    // Convenience gates
    hasFeature(key: FeatureKey): boolean {
        return hasFeature(this.plan(), key);
    }

    canUseRoute(routeKey: RouteKey): boolean {
        return canUseRoute(this.role(), this.plan(), routeKey);
    }
}
