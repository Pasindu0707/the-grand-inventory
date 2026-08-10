/**
 * Copy for the `/dev/design-system` shell only — not production routes.
 */
export const GALLERY_PAGE_MOCK = {
    eyebrow: 'Design system',
    title: 'Developer samples',
    descriptionLead: 'Live previews under ',
    descriptionTrail:
        '. Use this page to verify Tailwind, PrimeNG, and Heroicons after you copy the folder into another Angular app.',
    pathCodeLabel: 'src/shared/design-system/'
} as const;

export const GALLERY_NAV_MOCK = [
    { href: '#ds-table', label: 'Table' },
    { href: '#ds-status', label: 'Status badge' },
    { href: '#ds-kpi', label: 'KPI card' },
    { href: '#ds-form-header', label: 'Form header' },
    { href: '#ds-empty-error', label: 'Empty & error' }
] as const;

export const GALLERY_FEEDBACK_MOCK = {
    emptyPrimary: 'Empty state: primary action clicked.',
    errorRetry: 'Error state: retry clicked.'
} as const;
