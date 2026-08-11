/**
 * All API access. Components never call HttpClient directly — the template's
 * own guardrail ("keep API integration in services only"), and it keeps the
 * request shapes in one place when the contract moves.
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api';
import type {
    BootstrapResponse,
    GrnInput,
    GrnListRow,
    GrnResult,
    Item,
    SessionResponse,
    StockResponse,
    Supplier
} from './types';

@Injectable({ providedIn: 'root' })
export class GrandService {
    private http = inject(HttpClient);

    // ── Auth ────────────────────────────────────────────────────────────────

    bootstrap(): Promise<BootstrapResponse> {
        return firstValueFrom(this.http.get<BootstrapResponse>(`${API_BASE}/auth/bootstrap`));
    }

    login(userId: number, locationId: number, pin: string): Promise<SessionResponse> {
        return firstValueFrom(
            this.http.post<SessionResponse>(`${API_BASE}/auth/login`, { userId, locationId, pin })
        );
    }

    // ── Master data ─────────────────────────────────────────────────────────

    listItems(search?: string): Promise<Item[]> {
        const params: Record<string, string> = search ? { search } : {};
        return firstValueFrom(this.http.get<Item[]>(`${API_BASE}/items`, { params }));
    }

    listSuppliers(): Promise<Supplier[]> {
        return firstValueFrom(this.http.get<Supplier[]>(`${API_BASE}/suppliers`));
    }

    // ── Stock ───────────────────────────────────────────────────────────────

    getStock(opts: { sectionId?: number; search?: string; belowReorder?: boolean } = {}): Promise<StockResponse> {
        const params: Record<string, string> = {};
        if (opts.sectionId) params['sectionId'] = String(opts.sectionId);
        if (opts.search) params['search'] = opts.search;
        if (opts.belowReorder) params['belowReorder'] = 'true';
        return firstValueFrom(this.http.get<StockResponse>(`${API_BASE}/stock`, { params }));
    }

    // ── Documents ───────────────────────────────────────────────────────────

    /**
     * The idempotency key belongs to the *form*, not to this call. It is minted
     * when the user opens the GRN screen and passed in here, so a double-tap on
     * a slow connection replays rather than receiving the delivery twice.
     */
    createGrn(input: GrnInput, idempotencyKey: string): Promise<GrnResult> {
        return firstValueFrom(
            this.http.post<GrnResult>(`${API_BASE}/grn`, input, {
                headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey })
            })
        );
    }

    listGrn(limit = 20): Promise<{ rows: GrnListRow[]; total: number }> {
        return firstValueFrom(
            this.http.get<{ rows: GrnListRow[]; total: number }>(`${API_BASE}/grn`, {
                params: { limit: String(limit) }
            })
        );
    }
}
