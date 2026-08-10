/** Section titles and blurbs for the gallery page — mock copy only. */
export const GALLERY_SECTIONS_COPY_MOCK = {
    table: {
        title: 'Table pattern',
        description:
            'Lazy p-table with caption, skeleton loading, empty message, and app-status-badge. Reference markup lives in components/table/index.html.'
    },
    status: {
        title: 'Status badge',
        description: 'app-status-badge — workflow status vs categorical meta.'
    },
    kpi: {
        title: 'KPI card',
        description: 'Severity borders and icon wells — matches dashboard KPI usage in AGENTS.md.'
    },
    formHeader: {
        title: 'Form header',
        description: 'Icon chip + title + subtitle + projected actions.'
    },
    emptyError: {
        title: 'Empty & error states',
        description: 'Use inside cards, tables, or full-page shells. Wire your own handlers to outputs.',
        emptyPanelLabel: 'Empty state',
        errorPanelLabel: 'Error state'
    }
} as const;
