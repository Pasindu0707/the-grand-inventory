import { Routes } from '@angular/router';
import { AppLayout } from '@/layout/components/app.layout';
import { authGuard, roleGuard } from '@/core/guards';

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
            { path: '', pathMatch: 'full', redirectTo: 'today' },
            {
                path: 'today',
                data: {
                    breadcrumb: 'Today',
                    routeKey: 'today',
                    allowed: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker', 'cleaning', 'purchasing']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/today.component').then((m) => m.TodayComponent),
                title: 'Today'
            },
            {
                path: 'grn',
                data: {
                    breadcrumb: 'Receive delivery',
                    routeKey: 'grn',
                    allowed: ['owner', 'manager', 'storekeeper', 'purchasing']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/grn.component').then((m) => m.GrnComponent),
                title: 'Receive delivery'
            },
            {
                path: 'stock',
                data: {
                    breadcrumb: 'Stock',
                    routeKey: 'stock',
                    allowed: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/stock.component').then((m) => m.StockComponent),
                title: 'Stock'
            },
            {
                path: 'market',
                data: {
                    breadcrumb: 'Market purchase',
                    routeKey: 'market',
                    allowed: ['owner', 'manager', 'storekeeper', 'purchasing']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/market.component').then((m) => m.MarketComponent),
                title: 'Market purchase'
            },
            {
                path: 'cleaning',
                data: {
                    breadcrumb: 'Cleaning',
                    routeKey: 'cleaning',
                    allowed: ['owner', 'manager', 'cleaning', 'storekeeper', 'chef', 'bar', 'baker']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/cleaning.component').then((m) => m.CleaningComponent),
                title: 'Cleaning'
            },
            {
                path: 'issues',
                data: {
                    breadcrumb: 'Issues',
                    routeKey: 'issues',
                    allowed: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker', 'cleaning']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/issues.component').then((m) => m.IssuesComponent),
                title: 'Issues'
            },
            {
                path: 'wastage',
                data: {
                    breadcrumb: 'Wastage',
                    routeKey: 'wastage',
                    allowed: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/wastage.component').then((m) => m.WastageComponent),
                title: 'Wastage'
            },
            {
                path: 'reports',
                data: { breadcrumb: 'Reports', routeKey: 'reports', allowed: ['owner', 'manager'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/reports.component').then((m) => m.ReportsComponent),
                title: 'Reports'
            },
            {
                path: 'counts',
                data: {
                    breadcrumb: 'Stock count',
                    routeKey: 'counts',
                    allowed: ['owner', 'manager', 'storekeeper', 'chef', 'bar', 'baker']
                },
                canActivate: [roleGuard],
                loadComponent: () => import('./pages/counts.component').then((m) => m.CountsComponent),
                title: 'Stock count'
            }
        ]
    },
    { path: '**', redirectTo: '' }
];
