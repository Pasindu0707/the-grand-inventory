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
            }
        ]
    },
    { path: '**', redirectTo: '' }
];
