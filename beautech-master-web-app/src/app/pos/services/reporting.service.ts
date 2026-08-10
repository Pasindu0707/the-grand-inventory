/** Reporting service — 7 report endpoints (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import type {
    BranchSalesRow,
    DailySalesReport,
    LocationStockRow,
    PaymentMethodRow,
    ShiftSummary,
    TaxLiabilityRow,
    TopSkuRow
} from '../core/types';

function toParams(params: Record<string, string | number | undefined>): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(params).forEach(([k, v]) => {
        if (v != null) out[k] = String(v);
    });
    return out;
}

@Injectable({ providedIn: 'root' })
export class ReportingService {
    private http = inject(HttpClient);

    dailySales(date: string): Promise<DailySalesReport> {
        return firstValueFrom(
            this.http.get<DailySalesReport>(`${API_BASE}/reports/daily-sales`, { params: { date } })
        );
    }

    shiftSummaries(params: { from?: string; to?: string }): Promise<ShiftSummary[]> {
        return firstValueFrom(this.http.get<ShiftSummary[]>(`${API_BASE}/reports/shifts`, { params: toParams(params) }));
    }

    taxLiabilities(params: { from?: string; to?: string }): Promise<TaxLiabilityRow[]> {
        return firstValueFrom(
            this.http.get<TaxLiabilityRow[]>(`${API_BASE}/reports/tax`, { params: toParams(params) })
        );
    }

    topSkus(params: { from?: string; to?: string }): Promise<TopSkuRow[]> {
        return firstValueFrom(this.http.get<TopSkuRow[]>(`${API_BASE}/reports/top-skus`, { params: toParams(params) }));
    }

    salesByBranch(params: { from?: string; to?: string }): Promise<BranchSalesRow[]> {
        return firstValueFrom(
            this.http.get<BranchSalesRow[]>(`${API_BASE}/reports/sales-by-branch`, { params: toParams(params) })
        );
    }

    paymentMethods(params: { from?: string; to?: string }): Promise<PaymentMethodRow[]> {
        return firstValueFrom(
            this.http.get<PaymentMethodRow[]>(`${API_BASE}/reports/payment-methods`, { params: toParams(params) })
        );
    }

    stockByLocation(): Promise<LocationStockRow[]> {
        return firstValueFrom(this.http.get<LocationStockRow[]>(`${API_BASE}/reports/stock-by-location`));
    }
}
