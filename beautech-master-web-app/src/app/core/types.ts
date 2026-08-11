/**
 * The Grand — shared types. Mirrors the API's Zod schemas in api/src/routes.
 *
 * Deliberately NOT derived from the POS template's types. Two differences make
 * reuse actively dangerous:
 *
 *  - There is no `stockQty` on an item. Stock is the sum of ledger movements
 *    per section, computed on read. A cached scalar is exactly the thing this
 *    system is designed not to have.
 *  - Ids are integers, not UUID strings. The database uses serial/bigserial.
 */

// ── Roles ───────────────────────────────────────────────────────────────────
// The schema's user_role enum, all eight of them.
export type Role =
    | 'owner'
    | 'manager'
    | 'storekeeper'
    | 'chef'
    | 'bar'
    | 'baker'
    | 'cleaning'
    | 'purchasing';

export const ROLE_LABELS: Record<Role, string> = {
    owner: 'Owner',
    manager: 'Manager',
    storekeeper: 'Storekeeper',
    chef: 'Chef',
    bar: 'Bar',
    baker: 'Baker',
    cleaning: 'Cleaning',
    purchasing: 'Purchasing'
};

export type RouteKey = 'today' | 'grn' | 'stock' | 'items' | 'reports';

// ── Session ─────────────────────────────────────────────────────────────────
export interface SessionUser {
    id: number;
    name: string;
    role: Role;
    /** Null for group-wide roles (owner). */
    homeLocationId: number | null;
}

export interface LocationRef {
    id: number;
    code: string;
    name: string;
}

export interface ActiveLocation extends LocationRef {
    /** Business-day cut-off, e.g. '06:00' — '04:00' at the 24-hour site. */
    dayStart: string;
}

export interface Section {
    id: number;
    code: string;
    name: string;
    isStore: boolean;
}

export interface SessionResponse {
    accessToken: string;
    refreshToken: string;
    user: SessionUser;
    location: ActiveLocation;
    locations: LocationRef[];
    sections: Section[];
}

export interface BootstrapResponse {
    locations: LocationRef[];
    users: { id: number; name: string; role: Role; locationId: number | null }[];
}

// ── Items and stock ─────────────────────────────────────────────────────────
export interface ItemPack {
    id: number;
    packName: string;
    /** How many stock units one pack holds. The only conversion factor. */
    qtyInStockUnit: number;
    isDefaultPurchase: boolean;
}

export interface Item {
    id: number;
    code: string;
    name: string;
    /** g, ml, ea — always the small unit. */
    stockUnit: string;
    categoryName: string;
    parLevel: number;
    reorderPoint: number;
    isCritical: boolean;
    packs: ItemPack[];
}

export interface Supplier {
    id: number;
    name: string;
    isCashMarket: boolean;
    phone: string | null;
}

export interface StockRow {
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    sectionId: number;
    sectionCode: string;
    qtyBase: number;
    avgCost: number;
    value: number;
    reorderPoint: number;
    parLevel: number;
    isCritical: boolean;
    belowReorder: boolean;
}

export interface StockResponse {
    rows: StockRow[];
    totalValue: number;
}

// ── GRN ─────────────────────────────────────────────────────────────────────
export interface GrnLineInput {
    itemPackId: number;
    /** Packs, never stock units. The conversion happens server-side, once. */
    qtyPacks: number;
    packPrice: number;
    expiryDate?: string | null;
}

export interface GrnInput {
    supplierId: number;
    invoiceNo?: string | null;
    invoiceDate?: string | null;
    photoUrl?: string | null;
    lines: GrnLineInput[];
}

export interface PriceWarning {
    itemPackId: number;
    itemName: string;
    packName: string;
    previousPrice: number;
    newPrice: number;
    changePct: number;
}

export interface GrnResult {
    id: string;
    total: number;
    businessDate: string;
    lineCount: number;
    priceWarnings: PriceWarning[];
}

export interface GrnListRow {
    id: string;
    supplierName: string;
    invoiceNo: string | null;
    receivedAt: string;
    total: number | null;
    lineCount: number;
}
