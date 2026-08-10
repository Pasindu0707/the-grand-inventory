/** Auth service: login / logout (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import { AuthStore } from '../stores/auth.store';
import { CartStore } from '../stores/cart.store';
import { setActiveCurrency } from '../core/money';
import { clearLocalData } from '../core/pos-database';
import type { AuthResponse } from '../core/types';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private http = inject(HttpClient);
    private auth = inject(AuthStore);
    private cart = inject(CartStore);

    async login(email: string, password: string): Promise<AuthResponse> {
        const res = await firstValueFrom(
            this.http.post<AuthResponse>(`${API_BASE}/auth/login`, { email, password })
        );
        this.auth.setSession(res);
        setActiveCurrency(res.tenant.currencyCode);
        return res;
    }

    async logout(): Promise<void> {
        try {
            await firstValueFrom(this.http.post(`${API_BASE}/auth/logout`, {}));
        } catch {
            /* best-effort server cleanup */
        }
        this.auth.clearSession();
        this.cart.clear();
        await clearLocalData();
    }
}
