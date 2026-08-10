/**
 * VendEasy POS — all shared TypeScript types & interfaces.
 * Ported from the React frontend (FRONTEND_DOCUMENTATION.md §8).
 */

// ── Enums (string union types) ──────────────────────────────────────────────
export type Role = 'OWNER' | 'MANAGER' | 'CASHIER';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED';
export type TransactionStatus = 'COMPLETED' | 'VOIDED' | 'REFUNDED';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';
export type PaymentMethod =
    | 'CASH'
    | 'VISA'
    | 'MASTERCARD'
    | 'BANK_TRANSFER'
    | 'GIFT_CARD'
    | 'LOYALTY_POINTS'
    | 'STRIPE_TERMINAL';
export type TransactionSource = 'POS' | 'ONLINE' | 'SYNC';
export type InventoryReason = 'RECOUNT' | 'RECEIVED' | 'DAMAGED' | 'RETURNED' | 'TRANSFER';
export type DiscountType = 'PERCENT' | 'FIXED';
export type DiscountScope = 'PRODUCT' | 'BILL';
export type LocationType = 'BRANCH' | 'WAREHOUSE';

export type RouteKey =
    | 'register'
    | 'transactions'
    | 'customers'
    | 'inventory'
    | 'discounts'
    | 'branches'
    | 'stock'
    | 'gift-cards'
    | 'employees'
    | 'reports'
    | 'sync-audit';

export type FeatureKey =
    | 'multi-branch'
    | 'gift-cards'
    | 'loyalty-program'
    | 'advanced-reports'
    | 'employee-management'
    | 'inventory-alerts'
    | 'stripe-terminal'
    | 'api-access'
    | 'custom-receipts'
    | 'multi-currency'
    | 'audit-log'
    | 'sso'
    | 'white-label';

// ── Auth types ──────────────────────────────────────────────────────────────
export interface AuthUser {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    tenantId: string;
}

export interface TenantBranding {
    id: string;
    shopName: string;
    currencyCode: string;
    logo: string | null;
}

export interface AuthBranch {
    id: string;
    name: string;
    type: LocationType;
    address: string | null;
}

export interface AuthConfig {
    loyaltyRedeemPointsPerCurrency: number;
}

export interface PlanSummary {
    planName: string;
    features: FeatureKey[];
    maxUsers: number;
    maxProducts: number;
    maxLocations: number;
}

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    tenant: TenantBranding;
    branch: AuthBranch | null;
    config: AuthConfig;
    plan: PlanSummary;
}

// ── Product / Catalog types ─────────────────────────────────────────────────
export interface ApiProduct {
    id: string;
    tenantId: string;
    categoryId: string | null;
    discountId: string | null;
    sku: string;
    name: string;
    price: string; // Decimal string e.g. "3.50"
    taxRate: string; // Decimal string e.g. "0.0800"
    costPrice: string | null;
    stockQty: number;
    lowStockThreshold: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    discount?: ApiDiscount | null;
}

export interface LocalProduct {
    id: string;
    sku: string;
    name: string;
    price: number;
    tax_rate: number;
    cost_price: number | null;
    stock_qty: number;
    low_stock_threshold: number;
    is_active: number; // 0 or 1
    category_id: string | null;
    tenant_id: string;
    discount_type: DiscountType | null;
    discount_value: number | null;
    discount_name: string | null;
}

export interface ApiCategory {
    id: string;
    tenantId: string;
    name: string;
    createdAt: string;
}

export interface LocalCategory {
    id: string;
    name: string;
    tenant_id: string;
}

// ── Cart & Checkout types ───────────────────────────────────────────────────
export interface CartLine {
    lineId: string;
    productId: string;
    sku: string;
    name: string;
    qty: number;
    unitPriceSnapshot: number;
    taxRateSnapshot: number;
    discountSnapshot: number;
    discountType: DiscountType | null;
    discountValue: number | null;
    discountName: string | null;
}

export interface CartTotals {
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    total: number;
}

export interface Tender {
    method: PaymentMethod;
    amount: number;
    cashReceived?: number;
    giftCardId?: string;
    giftCardCode?: string;
    loyaltyPointsUsed?: number;
    stripePaymentIntentId?: string;
}

export interface CheckoutPayload {
    lines: CartLine[];
    employeeId: string;
    tenantId: string;
    customerId: string | null;
    tenders: Tender[];
}

export interface CheckoutReceipt {
    transaction: LocalTransaction;
    lineItems: LocalLineItem[];
    tenders: Tender[];
    changeGiven: number;
}

export interface BillDiscountSpec {
    discountId: string;
    name: string;
    type: DiscountType;
    value: number;
}

// ── Offline / Sync types ────────────────────────────────────────────────────
export interface LocalTransaction {
    id: string;
    employee_id: string;
    customer_id: string | null;
    subtotal: number;
    tax_total: number;
    discount_total: number;
    total: number;
    status: TransactionStatus;
    payment_status: PaymentStatus;
    payment_method: PaymentMethod;
    cash_received: number | null;
    change_given: number | null;
    idempotency_key: string;
    created_at: string;
    synced: 0 | 1;
    tenant_id: string;
}

export interface LocalLineItem {
    id: string;
    transaction_id: string;
    product_id: string;
    qty: number;
    unit_price_snapshot: number;
    tax_rate_snapshot: number;
    discount_snapshot: number;
    line_total: number;
}

export interface SyncQueueRow {
    id: string;
    payload_type: 'TRANSACTION';
    payload: string; // JSON string of OfflineTransactionPayload
    status: 'PENDING' | 'REJECTED';
    retry_count: number;
    created_at: string;
}

export interface SyncAlertRow {
    id: string;
    transaction_id: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
    acknowledged: 0 | 1;
    created_at: string;
}

export interface OfflineTransactionPayload {
    id: string;
    clientCreatedAt: string;
    idempotencyKey: string;
    customerId?: string;
    items: {
        productId: string;
        qty: number;
        unitPriceSnapshot: number;
        taxRateSnapshot: number;
        discount: number;
    }[];
    payment: {
        method: PaymentMethod;
        cashReceived?: number;
    };
}

export interface SyncReport {
    processed: { id: string; stockConflict?: boolean }[];
    skipped: { id: string; reason: string }[];
    rejected: { id: string; reason: string }[];
}

// ── Tenant / Admin types ────────────────────────────────────────────────────
export interface Tenant {
    id: string;
    shopName: string;
    subdomain: string;
    status: TenantStatus;
    planId: string;
    currencyCode: string;
    logo: string | null;
    createdAt: string;
}

export interface SubscriptionPlan {
    id: string;
    planName: string;
    maxUsers: number;
    maxProducts: number;
    maxLocations: number;
    features: FeatureKey[];
    monthlyPrice: string;
}

export interface OnboardTenantPayload {
    shopName: string;
    subdomain: string;
    planId: string;
    currencyCode: string;
    logo: string | null;
    ownerFullName: string;
    ownerEmail: string;
    ownerPassword: string;
}

export interface OnboardingResult {
    tenant: Tenant;
    owner: { id: string; email: string };
}

// ── Reporting types ─────────────────────────────────────────────────────────
export interface DailySalesReport {
    totalSales: number;
    transactionCount: number;
    averageTicket: number;
    taxCollected: number;
    netRevenue: number;
}

export interface TaxLiabilityRow {
    date: string;
    amount: number;
}
export interface TopSkuRow {
    sku: string;
    name: string;
    unitsSold: number;
    revenue: number;
}
export interface BranchSalesRow {
    branchId: string;
    branchName: string;
    total: number;
    count: number;
}
export interface PaymentMethodRow {
    method: PaymentMethod;
    total: number;
    count: number;
}
export interface LocationStockRow {
    locationId: string;
    locationName: string;
    productCount: number;
    totalUnits: number;
}
export interface ShiftSummary {
    employeeId: string;
    employeeName: string;
    clockIn: string;
    clockOut: string | null;
    salesTotal: number;
    transactionCount: number;
}

// ── Customer / Gift Card / Discount types ──────────────────────────────────
export interface ApiCustomer {
    id: string;
    tenantId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface LocalCustomer {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    loyalty_points: number;
    tenant_id: string;
}

export interface ApiDiscount {
    id: string;
    tenantId: string;
    name: string;
    type: DiscountType;
    value: number;
    scope: DiscountScope;
    isActive: boolean;
    createdAt: string;
}

export interface LocalDiscount {
    id: string;
    name: string;
    type: DiscountType;
    value: number;
    scope: DiscountScope;
    is_active: number;
    tenant_id: string;
}

export interface GiftCard {
    id: string;
    code: string;
    balance: number;
    isActive: boolean;
    issuedAt: string;
}

// ── Server transaction (online) ─────────────────────────────────────────────
export interface ServerTransaction {
    id: string;
    employeeId: string;
    employeeName?: string;
    customerId: string | null;
    customerName?: string | null;
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    total: number;
    status: TransactionStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    source: TransactionSource;
    createdAt: string;
    items?: ServerLineItem[];
    tenders?: Tender[];
}

export interface ServerLineItem {
    id: string;
    productId: string;
    name: string;
    qty: number;
    unitPrice: number;
    taxRate: number;
    discount: number;
    lineTotal: number;
}

export interface Employee {
    id: string;
    fullName: string;
    email: string;
    role: Role;
    branchId: string | null;
    branchName?: string | null;
}

export interface Shift {
    id: string;
    employeeId: string;
    employeeName: string;
    clockIn: string;
    clockOut: string | null;
    salesTotal?: number;
    transactionCount?: number;
}

export interface LocationStock {
    productId: string;
    sku: string;
    name: string;
    qty: number;
    lowStockThreshold: number;
}

export interface StockTransfer {
    id: string;
    sourceLocationId: string;
    sourceLocationName: string;
    destinationLocationId: string;
    destinationLocationName: string;
    createdAt: string;
    items: { productId: string; name: string; qty: number }[];
}
