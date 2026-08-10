/** Sales service: online checkout + transaction queries (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import type { CheckoutPayload, ServerTransaction } from '../core/types';

export interface PagedResult<T> {
    rows: T[];
    total: number;
}

@Injectable({ providedIn: 'root' })
export class SalesService {
    private http = inject(HttpClient);

    checkoutOnline(payload: CheckoutPayload): Promise<ServerTransaction> {
        return firstValueFrom(this.http.post<ServerTransaction>(`${API_BASE}/sales/checkout`, payload));
    }

    listTransactions(params: Record<string, string | number>): Promise<PagedResult<ServerTransaction>> {
        const httpParams: Record<string, string> = {};
        Object.entries(params).forEach(([k, v]) => (httpParams[k] = String(v)));
        return firstValueFrom(
            this.http.get<PagedResult<ServerTransaction>>(`${API_BASE}/sales/transactions`, { params: httpParams })
        );
    }

    getTransaction(id: string): Promise<ServerTransaction> {
        return firstValueFrom(this.http.get<ServerTransaction>(`${API_BASE}/sales/transactions/${id}`));
    }

    updateTransactionCustomer(id: string, customerId: string | null): Promise<ServerTransaction> {
        return firstValueFrom(
            this.http.patch<ServerTransaction>(`${API_BASE}/sales/transactions/${id}`, { customerId })
        );
    }

    voidTransaction(id: string): Promise<unknown> {
        return firstValueFrom(this.http.post(`${API_BASE}/sales/transactions/${id}/void`, {}));
    }

    refundTransaction(id: string, params: Record<string, unknown>): Promise<unknown> {
        return firstValueFrom(this.http.post(`${API_BASE}/sales/transactions/${id}/refund`, params));
    }
}
