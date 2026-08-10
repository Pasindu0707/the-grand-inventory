/** Feature catalog + nav feature gating (FRONTEND_DOCUMENTATION.md §5.5 / §7.2). */
import type { FeatureKey, RouteKey } from './types';

export interface FeatureCatalogItem {
    key: FeatureKey;
    label: string;
    tier: 'Growth' | 'Pro' | 'Enterprise';
}

export const FEATURE_CATALOG: FeatureCatalogItem[] = [
    { key: 'multi-branch', label: 'Multi-branch locations', tier: 'Growth' },
    { key: 'gift-cards', label: 'Gift cards', tier: 'Growth' },
    { key: 'loyalty-program', label: 'Loyalty program', tier: 'Growth' },
    { key: 'advanced-reports', label: 'Advanced reporting', tier: 'Growth' },
    { key: 'employee-management', label: 'Employee management', tier: 'Growth' },
    { key: 'inventory-alerts', label: 'Low-stock alerts', tier: 'Growth' },
    { key: 'stripe-terminal', label: 'Stripe Terminal integration', tier: 'Pro' },
    { key: 'api-access', label: 'API access', tier: 'Pro' },
    { key: 'custom-receipts', label: 'Custom receipt templates', tier: 'Pro' },
    { key: 'multi-currency', label: 'Multi-currency support', tier: 'Enterprise' },
    { key: 'audit-log', label: 'Audit logging', tier: 'Enterprise' },
    { key: 'sso', label: 'Single sign-on (SSO)', tier: 'Enterprise' },
    { key: 'white-label', label: 'White-label branding', tier: 'Enterprise' }
];

export const FEATURE_LABELS: Record<FeatureKey, string> = FEATURE_CATALOG.reduce(
    (acc, f) => {
        acc[f.key] = f.label;
        return acc;
    },
    {} as Record<FeatureKey, string>
);

export const NAV_FEATURE_REQUIREMENTS: Partial<Record<RouteKey, FeatureKey>> = {
    branches: 'multi-branch',
    stock: 'multi-branch',
    'gift-cards': 'gift-cards'
};
