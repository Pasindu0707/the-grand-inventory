/** Gift card lifecycle (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import type { GiftCard } from '../core/types';

export interface IssueGiftCardInput {
    amount: number;
    code?: string;
}

@Injectable({ providedIn: 'root' })
export class GiftCardsService {
    private http = inject(HttpClient);

    listGiftCards(): Promise<GiftCard[]> {
        return firstValueFrom(this.http.get<GiftCard[]>(`${API_BASE}/gift-cards`));
    }

    issueGiftCard(data: IssueGiftCardInput): Promise<GiftCard> {
        return firstValueFrom(this.http.post<GiftCard>(`${API_BASE}/gift-cards`, data));
    }

    lookupGiftCard(code: string): Promise<GiftCard> {
        return firstValueFrom(this.http.get<GiftCard>(`${API_BASE}/gift-cards/lookup`, { params: { code } }));
    }

    topUpGiftCard(id: string, amount: number): Promise<GiftCard> {
        return firstValueFrom(this.http.post<GiftCard>(`${API_BASE}/gift-cards/${id}/top-up`, { amount }));
    }

    deactivateGiftCard(id: string): Promise<GiftCard> {
        return firstValueFrom(this.http.patch<GiftCard>(`${API_BASE}/gift-cards/${id}`, { isActive: false }));
    }
}
