/**
 * Mock data for design-system demos only — not for production APIs.
 * Copy this folder to a new project: keep mocks here so feature code never imports them by accident.
 */
import type { MenuItem } from 'primeng/api';

export type TableDemoRow = {
    id: number;
    referenceNo: string;
    name: string;
    date: string;
    amount: number;
    currency: string;
    status: string;
    createdBy: string;
    createdAt: string;
};

/** Deterministic fake rows for the `/dev/design-system` table sample. */
export function buildTableDemoRows(count = 37): TableDemoRow[] {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        referenceNo: `REF-${1000 + i}`,
        name: `Sample ${i + 1}`,
        date: '2026-01-15',
        amount: 1000 * (i + 1),
        currency: 'LKR',
        status: i % 3 === 0 ? 'DRAFT' : i % 3 === 1 ? 'APPROVED' : 'PENDING',
        createdBy: 'Demo User',
        createdAt: '2026-01-10'
    }));
}

/** Table caption + actions — gallery-only UI strings. */
export const TABLE_DEMO_UI_MOCK = {
    captionTitle: 'Sample list',
    searchPlaceholder: 'Search records',
    newRecordLabel: 'New record',
    emptyTitle: 'No records found',
    emptySubtitle: 'Try adjusting search or filters.'
} as const;

/** Row action menu in the table gallery — mock only. */
export const TABLE_DEMO_ROW_MENU_MOCK: MenuItem[] = [{ label: 'View', icon: 'pi pi-eye' }];
