/** Discounts service (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import { db } from '../core/pos-database';
import type { ApiDiscount, DiscountScope, DiscountType, LocalDiscount } from '../core/types';

export interface DiscountInput {
    name: string;
    type: DiscountType;
    value: number;
    scope: DiscountScope;
    isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class DiscountsService {
    private http = inject(HttpClient);

    listDiscounts(): Promise<ApiDiscount[]> {
        return firstValueFrom(this.http.get<ApiDiscount[]>(`${API_BASE}/discounts`));
    }

    createDiscount(data: DiscountInput): Promise<ApiDiscount> {
        return firstValueFrom(this.http.post<ApiDiscount>(`${API_BASE}/discounts`, data));
    }

    updateDiscount(id: string, data: Partial<DiscountInput>): Promise<ApiDiscount> {
        return firstValueFrom(this.http.put<ApiDiscount>(`${API_BASE}/discounts/${id}`, data));
    }

    deleteDiscount(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${API_BASE}/discounts/${id}`));
    }

    listLocalBillDiscounts(): Promise<LocalDiscount[]> {
        return db.discounts.where('scope').equals('BILL').toArray();
    }
}
