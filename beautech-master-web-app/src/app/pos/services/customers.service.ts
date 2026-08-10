/** Customers service + loyalty (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import { db, toLocalCustomer } from '../core/pos-database';
import type { ApiCustomer, ServerTransaction } from '../core/types';

export interface CustomerInput {
    fullName: string;
    email?: string | null;
    phone?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CustomersService {
    private http = inject(HttpClient);

    listCustomers(): Promise<ApiCustomer[]> {
        return firstValueFrom(this.http.get<ApiCustomer[]>(`${API_BASE}/customers`));
    }

    async createCustomer(data: CustomerInput): Promise<ApiCustomer> {
        const c = await firstValueFrom(this.http.post<ApiCustomer>(`${API_BASE}/customers`, data));
        await db.customers.put(toLocalCustomer(c));
        return c;
    }

    async updateCustomer(id: string, data: Partial<CustomerInput>): Promise<ApiCustomer> {
        const c = await firstValueFrom(this.http.put<ApiCustomer>(`${API_BASE}/customers/${id}`, data));
        const existing = await db.customers.get(id);
        const local = toLocalCustomer(c);
        if (existing) local.loyalty_points = existing.loyalty_points;
        await db.customers.put(local);
        return c;
    }

    async deleteCustomer(id: string): Promise<void> {
        await firstValueFrom(this.http.delete(`${API_BASE}/customers/${id}`));
        await db.customers.delete(id);
    }

    purchaseHistory(id: string): Promise<ServerTransaction[]> {
        return firstValueFrom(this.http.get<ServerTransaction[]>(`${API_BASE}/customers/${id}/purchases`));
    }

    loyaltyBalance(id: string): Promise<{ points: number }> {
        return firstValueFrom(this.http.get<{ points: number }>(`${API_BASE}/customers/${id}/loyalty`));
    }

    async redeemPoints(id: string, points: number): Promise<{ points: number }> {
        const res = await firstValueFrom(
            this.http.post<{ points: number }>(`${API_BASE}/customers/${id}/loyalty/redeem`, { points })
        );
        const existing = await db.customers.get(id);
        if (existing) {
            existing.loyalty_points = res.points;
            await db.customers.put(existing);
        }
        return res;
    }
}
