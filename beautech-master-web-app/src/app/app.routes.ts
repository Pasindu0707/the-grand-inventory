import { Routes } from '@angular/router';
import { AppLayout } from '@/layout/components/app.layout';
import { authGuard, roleGuard } from '@/core/guards';

/**
 * Everyday screens first, advanced ones after.
 *
 * "Advanced" means deliveries, counts, wastage and reports: real features that
 * a kitchen or cleaning login has no use for. They stay in the app for
 * management, they are simply not in anyone else's way.
 */
export const appRoutes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent),
        title: 'Sign in — The Grand'
    },
    {
        path: '',
        component: AppLayout,
        canActivate: [authGuard],
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'home' },

            // ── Everyday ────────────────────────────────────────────────────
            {
                path: 'home',
                data: {
                    breadcrumb: 'Home',
                    routeKey: 'home',
                    allowed: ['admin', 'management', 'storekeeper', 'kitchen', 'cleaning']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/home.component').then((m) => m.HomeComponent),
                title: 'Home'
            },
            {
                path: 'ask',
                data: {
                    breadcrumb: 'Ask for stock',
                    routeKey: 'ask',
                    allowed: ['management', 'storekeeper', 'kitchen', 'cleaning']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/ask.component').then((m) => m.AskComponent),
                title: 'Ask for stock'
            },
            {
                path: 'requests',
                data: {
                    breadcrumb: 'Requests',
                    routeKey: 'requests',
                    allowed: ['management', 'storekeeper', 'kitchen', 'cleaning']
                },
                canActivate: [roleGuard],
                loadComponent: () =>
                    import('./pages/requests.component').then((m) => m.RequestsComponent),
                title: 'Requests'
            },
            {
                path: 'mystock',
                data: {
                    breadcrumb: 'What we have',
                    routeKey: 'mystock',
                    allowed: ['management', 'storekeeper', 'kitchen', 'cleaning']
                },
                canActivate: [roleGuard],
                loadComponent: () =>
                    import('./pages/my-stock.component').then((m) => m.MyStockComponent),
                title: 'What we have'
            },
            {
                path: 'purchases',
                data: {
                    breadcrumb: 'Purchases',
                    routeKey: 'purchases',
                    allowed: ['management', 'storekeeper', 'kitchen', 'cleaning']
                },
                canActivate: [roleGuard],
                loadComponent: () =>
                    import('./pages/purchases.component').then((m) => m.PurchasesComponent),
                title: 'Purchases'
            },
            {
                path: 'cleaning',
                data: {
                    breadcrumb: 'Cleaning',
                    routeKey: 'cleaning',
                    allowed: ['management', 'cleaning', 'storekeeper', 'kitchen']
                },
                canActivate: [roleGuard],
                loadComponent: () =>
                    import('./pages/cleaning.component').then((m) => m.CleaningComponent),
                title: 'Cleaning'
            },
            {
                path: 'users',
                data: { breadcrumb: 'Logins', routeKey: 'users', allowed: ['admin'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/users.component').then((m) => m.UsersComponent),
                title: 'Logins'
            },

            // ── Advanced: management and the storekeeper only ───────────────
            {
                path: 'grn',
                data: {
                    breadcrumb: 'Receive delivery',
                    routeKey: 'grn',
                    allowed: ['management', 'storekeeper']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/grn.component').then((m) => m.GrnComponent),
                title: 'Receive delivery'
            },
            {
                path: 'market',
                data: {
                    breadcrumb: 'Market purchase',
                    routeKey: 'market',
                    allowed: ['management', 'storekeeper']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/market.component').then((m) => m.MarketComponent),
                title: 'Market purchase'
            },
            {
                path: 'stock',
                data: {
                    breadcrumb: 'Stock detail',
                    routeKey: 'stock',
                    allowed: ['management', 'storekeeper']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/stock.component').then((m) => m.StockComponent),
                title: 'Stock detail'
            },
            {
                path: 'wastage',
                data: {
                    breadcrumb: 'Wastage',
                    routeKey: 'wastage',
                    allowed: ['management', 'storekeeper', 'kitchen']
                },
                canActivate: [roleGuard],
                loadComponent: () =>
                    import('./pages/wastage.component').then((m) => m.WastageComponent),
                title: 'Wastage'
            },
            {
                path: 'counts',
                data: {
                    breadcrumb: 'Stock count',
                    routeKey: 'counts',
                    allowed: ['management', 'storekeeper', 'kitchen']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/counts.component').then((m) => m.CountsComponent),
                title: 'Stock count'
            },
            {
                path: 'reports',
                data: { breadcrumb: 'Reports', routeKey: 'reports', allowed: ['management'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/reports.component').then((m) => m.ReportsComponent),
                title: 'Reports'
            }
        ]
    },
    { path: '**', redirectTo: '' }
];
