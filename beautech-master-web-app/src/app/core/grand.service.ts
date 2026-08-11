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
    Branch,
    CloseCountResult,
    CountDetail,
    CountLine,
    BelowReorderRow,
    CleaningToday,
    CountListRow,
    DateRange,
    CountType,
    GrnInput,
    GrnListRow,
    GrnResult,
    IssueDetail,
    IssueWindow,
    Item,
    ManagedUser,
    MyContext,
    PoDecision,
    PurchaseOrder,
    ReleaseResult,
    RequestRow,
    Role,
    Shortage,
    MarketInput,
    MarketListRow,
    MarketResult,
    PriceMovementRow,
    ReasonCode,
    SessionResponse,
    ShrinkageRow,
    StockOutRow,
    StockResponse,
    Supplier,
    UploadResult,
    UsageTrendPoint,
    UsageVarianceRow,
    WastageReport,
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

    // ── Who am I ────────────────────────────────────────────────────────────

    myContext(): Promise<MyContext> {
        return firstValueFrom(this.http.get<MyContext>(`${API_BASE}/me/context`));
    }

    // ── Requests: ask → release → confirm ───────────────────────────────────

    listRequests(opts: { status?: string; mineOnly?: boolean } = {}): Promise<RequestRow[]> {
        const params: Record<string, string> = {};
        if (opts.status) params['status'] = opts.status;
        if (opts.mineOnly) params['mineOnly'] = 'true';
        return firstValueFrom(this.http.get<RequestRow[]>(`${API_BASE}/requests`, { params }));
    }

    /** Ask the store before submitting, so a shortage can be shown up front. */
    checkStore(lines: { itemId: number; qtyRequested: number }[]): Promise<{ shortages: Shortage[] }> {
        return firstValueFrom(
            this.http.post<{ shortages: Shortage[] }>(`${API_BASE}/requests/check`, { lines })
        );
    }

    ask(body: {
        sectionId?: number;
        neededBy?: string | null;
        note?: string | null;
        lines: { itemId: number; qtyRequested: number }[];
    }): Promise<{ id: string; shortages: Shortage[] }> {
        return firstValueFrom(
            this.http.post<{ id: string; shortages: Shortage[] }>(`${API_BASE}/requests`, body)
        );
    }

    releaseRequest(
        id: string,
        lines: { lineId: string; qtyIssued: number }[],
        idempotencyKey: string
    ): Promise<ReleaseResult> {
        return firstValueFrom(
            this.http.post<ReleaseResult>(
                `${API_BASE}/requests/${id}/release`,
                { lines },
                { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) }
            )
        );
    }

    confirmReceived(id: string): Promise<{ ok: true }> {
        return firstValueFrom(this.http.post<{ ok: true }>(`${API_BASE}/requests/${id}/confirm`, {}));
    }

    cancelRequest(id: string): Promise<{ ok: true }> {
        return firstValueFrom(this.http.post<{ ok: true }>(`${API_BASE}/requests/${id}/cancel`, {}));
    }

    /** The lines of one request, for the release screen. */
    getRequest(id: string): Promise<IssueDetail> {
        return firstValueFrom(this.http.get<IssueDetail>(`${API_BASE}/issues/${id}`));
    }

    issueWindows(): Promise<IssueWindow[]> {
        return firstValueFrom(this.http.get<IssueWindow[]>(`${API_BASE}/issue-windows`));
    }

    // ── Purchase orders ─────────────────────────────────────────────────────

    listPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
        const params: Record<string, string> = status ? { status } : {};
        return firstValueFrom(
            this.http.get<PurchaseOrder[]>(`${API_BASE}/purchase-orders`, { params })
        );
    }

    raisePurchaseOrder(body: {
        issueId?: string | null;
        neededBy?: string | null;
        reason?: string | null;
        lines: { itemId: number; qtyBase: number; estPrice?: number | null }[];
    }): Promise<{ id: string }> {
        return firstValueFrom(
            this.http.post<{ id: string }>(`${API_BASE}/purchase-orders`, body)
        );
    }

    decidePurchaseOrder(id: string, decision: PoDecision, note?: string): Promise<{ ok: true }> {
        return firstValueFrom(
            this.http.post<{ ok: true }>(`${API_BASE}/purchase-orders/${id}/decide`, {
                decision,
                note: note ?? null
            })
        );
    }

    // ── Admin ───────────────────────────────────────────────────────────────

    listUsers(): Promise<ManagedUser[]> {
        return firstValueFrom(this.http.get<ManagedUser[]>(`${API_BASE}/admin/users`));
    }

    listBranches(): Promise<Branch[]> {
        return firstValueFrom(this.http.get<Branch[]>(`${API_BASE}/admin/branches`));
    }

    createUser(body: {
        name: string;
        role: Role;
        locationId: number | null;
        pin: string;
        phone?: string | null;
    }): Promise<ManagedUser> {
        return firstValueFrom(this.http.post<ManagedUser>(`${API_BASE}/admin/users`, body));
    }

    updateUser(
        id: number,
        body: { role?: Role; locationId?: number | null; pin?: string; isActive?: boolean }
    ): Promise<{ ok: true }> {
        return firstValueFrom(this.http.patch<{ ok: true }>(`${API_BASE}/admin/users/${id}`, body));
    }

    unlockUser(id: number): Promise<{ ok: true }> {
        return firstValueFrom(
            this.http.post<{ ok: true }>(`${API_BASE}/admin/users/${id}/unlock`, {})
        );
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

    // ── Reports ─────────────────────────────────────────────────────────────

    usageVariance(range: DateRange, minPct = 8): Promise<DateRange & { rows: UsageVarianceRow[] }> {
        return firstValueFrom(
            this.http.get<DateRange & { rows: UsageVarianceRow[] }>(
                `${API_BASE}/reports/usage-variance`,
                { params: { ...range, minPct: String(minPct) } }
            )
        );
    }

    usageTrend(itemId: number, range: DateRange): Promise<UsageTrendPoint[]> {
        return firstValueFrom(
            this.http.get<UsageTrendPoint[]>(`${API_BASE}/reports/usage-variance/${itemId}`, {
                params: { ...range }
            })
        );
    }

    shrinkage(range: DateRange): Promise<DateRange & { rows: ShrinkageRow[]; totalValue: number }> {
        return firstValueFrom(
            this.http.get<DateRange & { rows: ShrinkageRow[]; totalValue: number }>(
                `${API_BASE}/reports/shrinkage`,
                { params: { ...range } }
            )
        );
    }

    priceMovement(range: DateRange, minPct = 5): Promise<DateRange & { rows: PriceMovementRow[] }> {
        return firstValueFrom(
            this.http.get<DateRange & { rows: PriceMovementRow[] }>(
                `${API_BASE}/reports/price-movement`,
                { params: { ...range, minPct: String(minPct) } }
            )
        );
    }

    wastageReport(range: DateRange): Promise<WastageReport> {
        return firstValueFrom(
            this.http.get<WastageReport>(`${API_BASE}/reports/wastage`, { params: { ...range } })
        );
    }

    stockOutReport(
        range: DateRange
    ): Promise<DateRange & { stockOuts: StockOutRow[]; belowReorder: BelowReorderRow[] }> {
        return firstValueFrom(
            this.http.get<DateRange & { stockOuts: StockOutRow[]; belowReorder: BelowReorderRow[] }>(
                `${API_BASE}/reports/stock-outs`,
                { params: { ...range } }
            )
        );
    }
}
