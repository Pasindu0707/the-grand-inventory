/** Catalog service: pull + product/category CRUD (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import { hydrateCatalog } from '../core/pos-database';
import type {
    ApiCategory,
    ApiCustomer,
    ApiDiscount,
    ApiProduct,
    InventoryReason
} from '../core/types';

export interface ProductInput {
    sku: string;
    name: string;
    price: number;
    taxRate: number;
    costPrice?: number | null;
    lowStockThreshold?: number;
    categoryId?: string | null;
    discountId?: string | null;
    stockQty?: number;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
    private http = inject(HttpClient);

    async pullCatalog(): Promise<void> {
        const [products, categories, customers, discounts] = await Promise.all([
            firstValueFrom(this.http.get<ApiProduct[]>(`${API_BASE}/products`)),
            firstValueFrom(this.http.get<ApiCategory[]>(`${API_BASE}/categories`)),
            firstValueFrom(this.http.get<ApiCustomer[]>(`${API_BASE}/customers`)),
            firstValueFrom(this.http.get<ApiDiscount[]>(`${API_BASE}/discounts`))
        ]);
        await hydrateCatalog(products ?? [], categories ?? [], customers ?? [], discounts ?? []);
    }

    listProducts(): Promise<ApiProduct[]> {
        return firstValueFrom(this.http.get<ApiProduct[]>(`${API_BASE}/products`));
    }

    createProduct(data: ProductInput): Promise<ApiProduct> {
        return firstValueFrom(this.http.post<ApiProduct>(`${API_BASE}/products`, data));
    }

    updateProduct(id: string, data: Partial<ProductInput>): Promise<ApiProduct> {
        return firstValueFrom(this.http.put<ApiProduct>(`${API_BASE}/products/${id}`, data));
    }

    deactivateProduct(id: string): Promise<ApiProduct> {
        return firstValueFrom(this.http.patch<ApiProduct>(`${API_BASE}/products/${id}`, { isActive: false }));
    }

    adjustStock(id: string, qty: number, reason: InventoryReason): Promise<unknown> {
        return firstValueFrom(this.http.post(`${API_BASE}/products/${id}/stock`, { qty, reason }));
    }

    listCategories(): Promise<ApiCategory[]> {
        return firstValueFrom(this.http.get<ApiCategory[]>(`${API_BASE}/categories`));
    }

    createCategory(name: string): Promise<ApiCategory> {
        return firstValueFrom(this.http.post<ApiCategory>(`${API_BASE}/categories`, { name }));
    }

    deleteCategory(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${API_BASE}/categories/${id}`));
    }

    listInventoryLogs(params: Record<string, string>): Promise<unknown[]> {
        return firstValueFrom(this.http.get<unknown[]>(`${API_BASE}/inventory/logs`, { params }));
    }
}
