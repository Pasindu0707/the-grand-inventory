import { Routes } from '@angular/router';
import { AppLayout } from '@/layout/components/app.layout';
import { authGuard, roleGuard } from '@/pos/core/guards';

export const appRoutes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./pos/pages/login.component').then((m) => m.LoginComponent),
        title: 'Sign in — VendEasy POS'
    },
    {
        path: 'admin',
        loadComponent: () => import('./pos/pages/admin/admin-panel.component').then((m) => m.AdminPanelComponent),
        title: 'Platform Admin'
    },
    {
        path: 'admin/onboard',
        loadComponent: () => import('./pos/pages/admin/onboard-shop.component').then((m) => m.OnboardShopComponent),
        title: 'Onboard shop'
    },
    {
        path: '',
        component: AppLayout,
        canActivate: [authGuard],
        children: [
            {
                path: '',
                pathMatch: 'full',
                redirectTo: 'register'
            },
            {
                path: 'register',
                data: { breadcrumb: 'Register', routeKey: 'register', allowed: ['OWNER', 'MANAGER', 'CASHIER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/register.component').then((m) => m.RegisterComponent),
                title: 'Register'
            },
            {
                path: 'transactions',
                data: { breadcrumb: 'Transactions', routeKey: 'transactions', allowed: ['OWNER', 'MANAGER', 'CASHIER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/transactions.component').then((m) => m.TransactionsComponent),
                title: 'Transactions'
            },
            {
                path: 'customers',
                data: { breadcrumb: 'Customers', routeKey: 'customers', allowed: ['OWNER', 'MANAGER', 'CASHIER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/customers.component').then((m) => m.CustomersComponent),
                title: 'Customers'
            },
            {
                path: 'inventory',
                data: { breadcrumb: 'Inventory', routeKey: 'inventory', allowed: ['OWNER', 'MANAGER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/inventory.component').then((m) => m.InventoryComponent),
                title: 'Inventory'
            },
            {
                path: 'discounts',
                data: { breadcrumb: 'Discounts', routeKey: 'discounts', allowed: ['OWNER', 'MANAGER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/discounts.component').then((m) => m.DiscountsComponent),
                title: 'Discounts'
            },
            {
                path: 'branches',
                data: { breadcrumb: 'Branches', routeKey: 'branches', allowed: ['OWNER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/branches.component').then((m) => m.BranchesComponent),
                title: 'Branches'
            },
            {
                path: 'stock',
                data: { breadcrumb: 'Stock', routeKey: 'stock', allowed: ['OWNER', 'MANAGER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/stock.component').then((m) => m.StockComponent),
                title: 'Stock'
            },
            {
                path: 'gift-cards',
                data: { breadcrumb: 'Gift Cards', routeKey: 'gift-cards', allowed: ['OWNER', 'MANAGER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/gift-cards.component').then((m) => m.GiftCardsComponent),
                title: 'Gift Cards'
            },
            {
                path: 'employees',
                data: { breadcrumb: 'Employees', routeKey: 'employees', allowed: ['OWNER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/employees.component').then((m) => m.EmployeesComponent),
                title: 'Employees'
            },
            {
                path: 'reports',
                data: { breadcrumb: 'Reports', routeKey: 'reports', allowed: ['OWNER', 'MANAGER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/reports.component').then((m) => m.ReportsComponent),
                title: 'Reports'
            },
            {
                path: 'sync-audit',
                data: { breadcrumb: 'Sync Audit', routeKey: 'sync-audit', allowed: ['OWNER', 'MANAGER'] },
                canActivate: [roleGuard],
                loadComponent: () => import('./pos/pages/sync-audit.component').then((m) => m.SyncAuditComponent),
                title: 'Sync Audit'
            },
            {
                path: 'upgrade',
                data: { breadcrumb: 'Upgrade' },
                loadComponent: () => import('./pos/pages/upgrade.component').then((m) => m.UpgradeComponent),
                title: 'Upgrade'
            }
        ]
    },
    { path: '**', redirectTo: '' }
];
