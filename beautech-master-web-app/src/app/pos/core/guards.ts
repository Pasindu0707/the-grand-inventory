/** Route guards: auth + role/feature gating (FRONTEND_DOCUMENTATION.md §14). */
import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthStore, canAccess } from '../stores/auth.store';
import { NAV_FEATURE_REQUIREMENTS, FEATURE_LABELS } from './features';
import type { Role, RouteKey } from './types';

export const authGuard: CanActivateFn = (_route, state) => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    if (auth.isAuthenticated()) return true;
    return router.createUrlTree(['/login'], { queryParams: { from: state.url } });
};

/** Factory: role + feature gate. Reads `routeKey` and `allowed` from route data. */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
    const auth = inject(AuthStore);
    const router = inject(Router);

    const allowed = (route.data['allowed'] as Role[]) ?? [];
    const routeKey = route.data['routeKey'] as RouteKey | undefined;

    if (!canAccess(auth.role(), allowed)) {
        return router.createUrlTree(['/register']);
    }

    if (routeKey) {
        const required = NAV_FEATURE_REQUIREMENTS[routeKey];
        if (required && !auth.hasFeature(required)) {
            return router.createUrlTree(['/upgrade'], {
                queryParams: { feature: FEATURE_LABELS[required], plan: auth.plan()?.planName ?? '' }
            });
        }
    }
    return true;
};
