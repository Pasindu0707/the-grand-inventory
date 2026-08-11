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
    CloseCountResult,
    CountDetail,
    CountLine,
    CleaningToday,
    CountListRow,
    CountType,
    FulfilResult,
    GrnInput,
    GrnListRow,
    GrnResult,
    IssueDetail,
    IssueListRow,
    IssueWindow,
    Item,
    MarketInput,
    MarketListRow,
    MarketResult,
    ReasonCode,
    SessionResponse,
    StockResponse,
    Supplier,
    UploadResult,
    WastageRow
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

    // ── Issues ──────────────────────────────────────────────────────────────

    listIssues(status?: string): Promise<IssueListRow[]> {
        const params: Record<string, string> = status ? { status } : {};
        return firstValueFrom(this.http.get<IssueListRow[]>(`${API_BASE}/issues`, { params }));
    }

    getIssue(id: string): Promise<IssueDetail> {
        return firstValueFrom(this.http.get<IssueDetail>(`${API_BASE}/issues/${id}`));
    }

    requestIssue(toSectionId: number, lines: { itemId: number; qtyRequested: number }[]): Promise<{ id: string }> {
        return firstValueFrom(
            this.http.post<{ id: string }>(`${API_BASE}/issues`, { toSectionId, lines })
        );
    }

    fulfilIssue(
        id: string,
        lines: { lineId: string; qtyIssued: number }[],
        idempotencyKey: string,
        note?: string
    ): Promise<FulfilResult> {
        return firstValueFrom(
            this.http.post<FulfilResult>(
                `${API_BASE}/issues/${id}/fulfil`,
                { lines, note: note ?? null },
                { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) }
            )
        );
    }

    cancelIssue(id: string): Promise<{ ok: true }> {
        return firstValueFrom(this.http.post<{ ok: true }>(`${API_BASE}/issues/${id}/cancel`, {}));
    }

    issueWindows(): Promise<IssueWindow[]> {
        return firstValueFrom(this.http.get<IssueWindow[]>(`${API_BASE}/issue-windows`));
    }

    // ── Wastage ─────────────────────────────────────────────────────────────

    reasonCodes(doc = 'wastage'): Promise<ReasonCode[]> {
        return firstValueFrom(
            this.http.get<ReasonCode[]>(`${API_BASE}/reason-codes`, { params: { doc } })
        );
    }

    listWastage(pendingOnly = false): Promise<WastageRow[]> {
        const params: Record<string, string> = pendingOnly ? { pendingOnly: 'true' } : {};
        return firstValueFrom(this.http.get<WastageRow[]>(`${API_BASE}/wastage`, { params }));
    }

    logWastage(body: {
        sectionId: number;
        itemId: number;
        qtyBase: number;
        reasonCode: string;
        photoUrl?: string | null;
        note?: string | null;
    }): Promise<{ id: string; businessDate: string }> {
        return firstValueFrom(
            this.http.post<{ id: string; businessDate: string }>(`${API_BASE}/wastage`, body)
        );
    }

    approveWastage(id: string): Promise<{ ok: true }> {
        return firstValueFrom(this.http.post<{ ok: true }>(`${API_BASE}/wastage/${id}/approve`, {}));
    }

    // ── Counts ──────────────────────────────────────────────────────────────

    listCounts(openOnly = false): Promise<CountListRow[]> {
        const params: Record<string, string> = openOnly ? { openOnly: 'true' } : {};
        return firstValueFrom(this.http.get<CountListRow[]>(`${API_BASE}/counts`, { params }));
    }

    getCount(id: string): Promise<CountDetail> {
        return firstValueFrom(this.http.get<CountDetail>(`${API_BASE}/counts/${id}`));
    }

    openCount(sectionId: number, countType: CountType): Promise<{ id: string; lines: CountLine[] }> {
        return firstValueFrom(
            this.http.post<{ id: string; lines: CountLine[] }>(`${API_BASE}/counts/open`, {
                sectionId,
                countType
            })
        );
    }

    saveCountLines(id: string, lines: { lineId: string; qtyCounted: number }[]): Promise<{ ok: true }> {
        return firstValueFrom(
            this.http.put<{ ok: true }>(`${API_BASE}/counts/${id}/lines`, { lines })
        );
    }

    closeCount(id: string): Promise<CloseCountResult> {
        return firstValueFrom(this.http.post<CloseCountResult>(`${API_BASE}/counts/${id}/close`, {}));
    }

    verifyCount(id: string): Promise<{ ok: true }> {
        return firstValueFrom(this.http.post<{ ok: true }>(`${API_BASE}/counts/${id}/verify`, {}));
    }

    // ── Corrections ─────────────────────────────────────────────────────────

    /** The only way to undo a posted document. There is no edit and no delete. */
    reverseDocument(doc: string, id: string, reason: string): Promise<{ rowsReversed: number }> {
        return firstValueFrom(
            this.http.post<{ rowsReversed: number }>(`${API_BASE}/documents/${doc}/${id}/reverse`, {
                reason
            })
        );
    }

    // ── Uploads ─────────────────────────────────────────────────────────────

    /** Returns the URL to store on the document. */
    uploadPhoto(file: File): Promise<UploadResult> {
        const form = new FormData();
        form.append('file', file, file.name);
        // No Content-Type header on purpose: the browser has to set the
        // multipart boundary itself.
        return firstValueFrom(this.http.post<UploadResult>(`${API_BASE}/uploads`, form));
    }

    // ── Market purchase ─────────────────────────────────────────────────────

    createMarketPurchase(input: MarketInput, idempotencyKey: string): Promise<MarketResult> {
        return firstValueFrom(
            this.http.post<MarketResult>(`${API_BASE}/market`, input, {
                headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey })
            })
        );
    }

    listMarket(limit = 20): Promise<MarketListRow[]> {
        return firstValueFrom(
            this.http.get<MarketListRow[]>(`${API_BASE}/market`, { params: { limit: String(limit) } })
        );
    }

    // ── Cleaning ────────────────────────────────────────────────────────────

    cleaningToday(): Promise<CleaningToday> {
        return firstValueFrom(this.http.get<CleaningToday>(`${API_BASE}/cleaning/today`));
    }

    logCleaning(taskId: number, photoUrl?: string | null, note?: string | null): Promise<{ id: string }> {
        return firstValueFrom(
            this.http.post<{ id: string }>(`${API_BASE}/cleaning/log`, {
                taskId,
                photoUrl: photoUrl ?? null,
                note: note ?? null
            })
        );
    }

    verifyCleaning(logId: string): Promise<{ ok: true }> {
        return firstValueFrom(
            this.http.post<{ ok: true }>(`${API_BASE}/cleaning/log/${logId}/verify`, {})
        );
    }
}
