/** Locations + stock transfers (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import type { AuthBranch, InventoryReason, LocationStock, LocationType, StockTransfer } from '../core/types';
import type { PagedResult } from './sales.service';

export interface LocationInput {
    name: string;
    type: LocationType;
    address?: string | null;
}

export interface AddStockInput {
    productId: string;
    qty: number;
    reason: InventoryReason;
}

export interface TransferInput {
    sourceLocationId: string;
    destinationLocationId: string;
    items: { productId: string; qty: number }[];
}

@Injectable({ providedIn: 'root' })
export class LocationsService {
    private http = inject(HttpClient);

    listLocations(): Promise<AuthBranch[]> {
        return firstValueFrom(this.http.get<AuthBranch[]>(`${API_BASE}/locations`));
    }

    createLocation(data: LocationInput): Promise<AuthBranch> {
        return firstValueFrom(this.http.post<AuthBranch>(`${API_BASE}/locations`, data));
    }

    updateLocation(id: string, data: Partial<LocationInput>): Promise<AuthBranch> {
        return firstValueFrom(this.http.put<AuthBranch>(`${API_BASE}/locations/${id}`, data));
    }

    deleteLocation(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${API_BASE}/locations/${id}`));
    }

    getLocationStock(id: string): Promise<LocationStock[]> {
        return firstValueFrom(this.http.get<LocationStock[]>(`${API_BASE}/locations/${id}/stock`));
    }

    addStock(locationId: string, data: AddStockInput): Promise<unknown> {
        return firstValueFrom(this.http.post(`${API_BASE}/locations/${locationId}/stock`, data));
    }

    listTransfers(params: Record<string, string | number> = {}): Promise<PagedResult<StockTransfer>> {
        const httpParams: Record<string, string> = {};
        Object.entries(params).forEach(([k, v]) => (httpParams[k] = String(v)));
        return firstValueFrom(this.http.get<PagedResult<StockTransfer>>(`${API_BASE}/transfers`, { params: httpParams }));
    }

    createTransfer(data: TransferInput): Promise<StockTransfer> {
        return firstValueFrom(this.http.post<StockTransfer>(`${API_BASE}/transfers`, data));
    }
}
