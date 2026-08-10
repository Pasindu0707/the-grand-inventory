/**
 * Platform admin API (FRONTEND_DOCUMENTATION.md §4.2). Authenticates via
 * x-admin-api-key header; not tied to the tenant session.
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import type { FeatureKey, OnboardTenantPayload, OnboardingResult, SubscriptionPlan, Tenant } from '../core/types';

export interface PlanInput {
    planName: string;
    maxUsers: number;
    maxProducts: number;
    maxLocations: number;
    monthlyPrice: number | string;
    features: FeatureKey[];
}

@Injectable({ providedIn: 'root' })
export class TenantsService {
    private http = inject(HttpClient);

    private keyHeaders(apiKey: string): { headers: HttpHeaders } {
        return { headers: new HttpHeaders({ 'x-admin-api-key': apiKey }) };
    }

    listPublicPlans(): Promise<SubscriptionPlan[]> {
        return firstValueFrom(this.http.get<SubscriptionPlan[]>(`${API_BASE}/plans`));
    }

    onboardTenant(apiKey: string, payload: OnboardTenantPayload): Promise<OnboardingResult> {
        return firstValueFrom(
            this.http.post<OnboardingResult>(`${API_BASE}/admin/tenants`, payload, this.keyHeaders(apiKey))
        );
    }

    listTenants(apiKey: string): Promise<Tenant[]> {
        return firstValueFrom(this.http.get<Tenant[]>(`${API_BASE}/admin/tenants`, this.keyHeaders(apiKey)));
    }

    getTenant(apiKey: string, id: string): Promise<Tenant> {
        return firstValueFrom(this.http.get<Tenant>(`${API_BASE}/admin/tenants/${id}`, this.keyHeaders(apiKey)));
    }

    updateTenant(apiKey: string, id: string, patch: Partial<Tenant>): Promise<Tenant> {
        return firstValueFrom(
            this.http.patch<Tenant>(`${API_BASE}/admin/tenants/${id}`, patch, this.keyHeaders(apiKey))
        );
    }

    createPlan(apiKey: string, payload: PlanInput): Promise<SubscriptionPlan> {
        return firstValueFrom(
            this.http.post<SubscriptionPlan>(`${API_BASE}/admin/plans`, payload, this.keyHeaders(apiKey))
        );
    }

    updatePlan(apiKey: string, id: string, payload: PlanInput): Promise<SubscriptionPlan> {
        return firstValueFrom(
            this.http.put<SubscriptionPlan>(`${API_BASE}/admin/plans/${id}`, payload, this.keyHeaders(apiKey))
        );
    }

    deletePlan(apiKey: string, id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${API_BASE}/admin/plans/${id}`, this.keyHeaders(apiKey)));
    }
}
