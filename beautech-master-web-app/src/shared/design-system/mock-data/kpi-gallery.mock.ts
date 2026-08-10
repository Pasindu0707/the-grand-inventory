export type KpiGalleryDemoRow = {
    label: string;
    value: string;
    severity: 'success' | 'warn' | 'danger' | 'info' | 'secondary';
    icon: string;
    infoSummary?: string;
    showInfoIcon?: boolean;
};

/** Four-tile strip for the design-system gallery — mock KPIs only. */
export const KPI_GALLERY_DEMO_MOCK: readonly KpiGalleryDemoRow[] = [
    {
        label: 'Revenue',
        value: 'LKR 12.4M',
        severity: 'success',
        icon: 'heroCurrencyDollarSolid',
        infoSummary: 'Rolling 30-day total.'
    },
    {
        label: 'At risk',
        value: '7',
        severity: 'warn',
        icon: 'heroExclamationTriangleSolid',
        infoSummary: 'Items breaching SLA.'
    },
    {
        label: 'Failed jobs',
        value: '2',
        severity: 'danger',
        icon: 'heroBellAlertSolid',
        showInfoIcon: false
    },
    {
        label: 'Active users',
        value: '842',
        severity: 'info',
        icon: 'heroChartBarSolid',
        infoSummary: 'Last 7 days.'
    }
];
