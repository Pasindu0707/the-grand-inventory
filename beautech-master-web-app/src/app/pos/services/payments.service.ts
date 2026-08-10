/** Stripe Terminal adapter (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';

export interface TerminalIntent {
    id: string;
    clientSecret?: string;
    status: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
    private http = inject(HttpClient);

    createConnectionToken(): Promise<{ secret: string }> {
        return firstValueFrom(this.http.post<{ secret: string }>(`${API_BASE}/payments/terminal/connection-token`, {}));
    }

    createTerminalIntent(amount: number): Promise<TerminalIntent> {
        return firstValueFrom(this.http.post<TerminalIntent>(`${API_BASE}/payments/terminal/intent`, { amount }));
    }

    confirmTerminalPayment(intentId: string): Promise<TerminalIntent> {
        return firstValueFrom(
            this.http.post<TerminalIntent>(`${API_BASE}/payments/terminal/confirm`, { intentId })
        );
    }

    /** Full tap-to-pay flow: connection token → intent → confirm. */
    async runCardPaymentFlow(amount: number): Promise<TerminalIntent> {
        await this.createConnectionToken();
        const intent = await this.createTerminalIntent(amount);
        return this.confirmTerminalPayment(intent.id);
    }
}
