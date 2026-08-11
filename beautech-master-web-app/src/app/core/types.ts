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

export type RouteKey =
    | 'today'
    | 'grn'
    | 'market'
    | 'stock'
    | 'issues'
    | 'wastage'
    | 'counts'
    | 'cleaning'
    | 'items'
    | 'reports';

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

// ── Issues ──────────────────────────────────────────────────────────────────
export interface IssueListRow {
    id: string;
    sectionCode: string;
    sectionName: string;
    status: string;
    requestedBy: string;
    requestedAt: string;
    lineCount: number;
}

export interface IssueLine {
    lineId: string;
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    qtyRequested: number;
    qtyIssued: number | null;
    availableInStore: number;
}

export interface IssueDetail {
    id: string;
    status: string;
    toSectionId: number;
    lines: IssueLine[];
}

export interface FulfilResult {
    id: string;
    businessDate: string;
    linesIssued: number;
    /** Advisory. An off-window issue is recorded, never refused. */
    windowWarning: string | null;
    shortfalls: { itemName: string; requested: number; issued: number; available: number }[];
}

export interface IssueWindow {
    at: string;
    label: string;
}

// ── Wastage ─────────────────────────────────────────────────────────────────
export interface ReasonCode {
    code: string;
    doc: string;
    label: string;
}

export interface WastageRow {
    id: string;
    itemName: string;
    sectionCode: string;
    qtyBase: number;
    stockUnit: string;
    reasonCode: string;
    reasonLabel: string;
    loggedBy: string;
    loggedAt: string;
    approved: boolean;
}

// ── Counts ──────────────────────────────────────────────────────────────────
export type CountType = 'daily_critical' | 'weekly_full' | 'monthly_full';

export interface CountLine {
    lineId: string;
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    /** Frozen when the count opened, never re-read. */
    qtyExpected: number;
    qtyCounted: number | null;
}

export interface CountDetail {
    id: string;
    countType: string;
    sectionId: number;
    businessDate: string;
    closed: boolean;
    verified: boolean;
    lines: CountLine[];
}

export interface CountListRow {
    id: string;
    countType: string;
    sectionCode: string;
    businessDate: string;
    countedBy: string;
    closed: boolean;
    verified: boolean;
}

export interface CloseCountResult {
    id: string;
    adjustments: number;
    varianceValue: number;
    biggest: { name: string; varianceQty: number; varianceValue: number }[];
}

// ── Market purchase ─────────────────────────────────────────────────────────
export interface MarketLineInput {
    itemId: number;
    /** In stock units — there is no pack at a market stall. */
    qtyBase: number;
    totalPrice: number;
}

export interface MarketInput {
    supplierId?: number | null;
    /** Required. The slip photo is the only evidence a cash buy has. */
    photoUrl: string;
    cashGiven?: number | null;
    cashReturned?: number | null;
    lines: MarketLineInput[];
}

export interface MarketResult {
    id: string;
    total: number;
    businessDate: string;
    lineCount: number;
    cashDiscrepancy: number | null;
}

export interface MarketListRow {
    id: string;
    supplierName: string | null;
    boughtAt: string;
    boughtBy: string;
    photoUrl: string | null;
    lineCount: number;
    total: number;
}

export interface UploadResult {
    url: string;
    filename: string;
}

// ── Cleaning ────────────────────────────────────────────────────────────────
export interface CleaningTask {
    taskId: number;
    areaCode: string;
    areaName: string;
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    doneToday: boolean;
    lastDoneOn: string | null;
    lastDoneBy: string | null;
    verified: boolean;
    logId: string | null;
}

export interface CleaningToday {
    businessDate: string;
    tasks: CleaningTask[];
}

// ── Reports ─────────────────────────────────────────────────────────────────
export interface DateRange {
    from: string;
    to: string;
}

export interface UsageVarianceRow {
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    sectionCode: string;
    theoreticalQty: number;
    actualQty: number;
    varianceQty: number;
    variancePct: number;
    varianceValue: number;
}

export interface ShrinkageRow {
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    sectionCode: string;
    businessDate: string;
    varianceQty: number;
    varianceValue: number;
    variancePct: number | null;
    /** A gap with a document behind it is explained; it is not shrinkage. */
    hasWastageDoc: boolean;
}

export interface PriceMovementRow {
    itemPackId: number;
    itemName: string;
    packName: string;
    supplierName: string;
    effectiveFrom: string;
    previousPrice: number;
    newPrice: number;
    changePct: number;
}

export interface WastageReportRow {
    reasonCode: string;
    reasonLabel: string;
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    sectionCode: string;
    events: number;
    qtyBase: number;
    value: number;
}

export interface WastageReport extends DateRange {
    rows: WastageReportRow[];
    byReason: { reasonCode: string; reasonLabel: string; events: number; value: number }[];
    totalValue: number;
}

export interface StockOutRow {
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    sectionCode: string;
    businessDate: string;
    balance: number;
}

export interface BelowReorderRow {
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    qtyBase: number;
    reorderPoint: number;
    parLevel: number;
    shortfall: number;
    isCritical: boolean;
}

export interface UsageTrendPoint {
    businessDate: string;
    theoreticalQty: number;
    actualQty: number;
}
