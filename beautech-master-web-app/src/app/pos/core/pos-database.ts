/**
 * Offline-first IndexedDB layer (Dexie 4) — 8 tables, mappers, operations.
 * Ported from FRONTEND_DOCUMENTATION.md §7.3 (pos-database.ts).
 */
import Dexie, { type Table } from 'dexie';
import type {
    ApiCategory,
    ApiCustomer,
    ApiDiscount,
    ApiProduct,
    LocalCategory,
    LocalCustomer,
    LocalDiscount,
    LocalLineItem,
    LocalProduct,
    LocalTransaction,
    SyncAlertRow,
    SyncQueueRow
} from './types';

export class PosDatabase extends Dexie {
    products!: Table<LocalProduct, string>;
    categories!: Table<LocalCategory, string>;
    customers!: Table<LocalCustomer, string>;
    discounts!: Table<LocalDiscount, string>;
    local_transactions!: Table<LocalTransaction, string>;
    local_line_items!: Table<LocalLineItem, string>;
    sync_queue!: Table<SyncQueueRow, string>;
    sync_alerts!: Table<SyncAlertRow, string>;

    constructor() {
        super('pos-client');
        this.version(2).stores({
            products: 'id, sku, category_id, tenant_id',
            categories: 'id, tenant_id',
            customers: 'id, tenant_id',
            discounts: 'id, scope, tenant_id',
            local_transactions: 'id, synced, created_at, tenant_id',
            local_line_items: 'id, transaction_id',
            sync_queue: 'id, status, created_at',
            sync_alerts: 'id, transaction_id, acknowledged, created_at'
        });
    }
}

export const db = new PosDatabase();

// ── Mappers (API → Dexie) ───────────────────────────────────────────────────
export function toLocalProduct(p: ApiProduct): LocalProduct {
    const discount = p.discount ?? null;
    return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: Number(p.price),
        tax_rate: Number(p.taxRate),
        cost_price: p.costPrice != null ? Number(p.costPrice) : null,
        stock_qty: Number(p.stockQty),
        low_stock_threshold: Number(p.lowStockThreshold),
        is_active: p.isActive ? 1 : 0,
        category_id: p.categoryId,
        tenant_id: p.tenantId,
        discount_type: discount ? discount.type : null,
        discount_value: discount ? Number(discount.value) : null,
        discount_name: discount ? discount.name : null
    };
}

export function toLocalDiscount(d: ApiDiscount): LocalDiscount {
    return {
        id: d.id,
        name: d.name,
        type: d.type,
        value: Number(d.value),
        scope: d.scope,
        is_active: d.isActive ? 1 : 0,
        tenant_id: d.tenantId
    };
}

export function toLocalCategory(c: ApiCategory): LocalCategory {
    return { id: c.id, name: c.name, tenant_id: c.tenantId };
}

export function toLocalCustomer(c: ApiCustomer): LocalCustomer {
    return {
        id: c.id,
        name: c.fullName,
        phone: c.phone,
        email: c.email,
        loyalty_points: 0,
        tenant_id: c.tenantId
    };
}

// ── Operations ──────────────────────────────────────────────────────────────
export async function hydrateCatalog(
    products: ApiProduct[],
    categories: ApiCategory[],
    customers: ApiCustomer[],
    discounts?: ApiDiscount[]
): Promise<void> {
    await db.transaction(
        'rw',
        db.products,
        db.categories,
        db.discounts,
        db.customers,
        async () => {
            // Atomic full replace of products/categories/discounts
            await db.products.clear();
            await db.products.bulkPut(products.map(toLocalProduct));

            await db.categories.clear();
            await db.categories.bulkPut(categories.map(toLocalCategory));

            if (discounts) {
                await db.discounts.clear();
                await db.discounts.bulkPut(discounts.map(toLocalDiscount));
            }

            // Upsert customers — preserve cached loyalty_points
            for (const apiCustomer of customers) {
                const existing = await db.customers.get(apiCustomer.id);
                const local = toLocalCustomer(apiCustomer);
                if (existing) {
                    local.loyalty_points = existing.loyalty_points;
                }
                await db.customers.put(local);
            }
        }
    );
}

export async function applyLocalStockMovement(items: { product_id: string; qty: number }[]): Promise<void> {
    await db.transaction('rw', db.products, async () => {
        for (const { product_id, qty } of items) {
            const product = await db.products.get(product_id);
            if (product) {
                product.stock_qty = product.stock_qty - qty;
                await db.products.put(product);
            }
        }
    });
}

export async function clearLocalData(): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.products,
            db.categories,
            db.customers,
            db.discounts,
            db.local_transactions,
            db.local_line_items,
            db.sync_queue,
            db.sync_alerts
        ],
        async () => {
            await Promise.all([
                db.products.clear(),
                db.categories.clear(),
                db.customers.clear(),
                db.discounts.clear(),
                db.local_transactions.clear(),
                db.local_line_items.clear(),
                db.sync_queue.clear(),
                db.sync_alerts.clear()
            ]);
        }
    );
}
