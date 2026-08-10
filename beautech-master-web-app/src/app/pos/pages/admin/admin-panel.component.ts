/** Platform admin dashboard (FRONTEND_DOCUMENTATION.md §2.3 AdminPanel). */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TenantsService, PlanInput } from '../../services/tenants.service';
import { FEATURE_CATALOG } from '../../core/features';
import { NotifyService } from '../../core/notify.service';
import { apiErrorMessage } from '../../core/api';
import type { FeatureKey, SubscriptionPlan, Tenant } from '../../core/types';

const ADMIN_KEY = 'pos-admin-key';

@Component({
    selector: 'pos-admin-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    template: `
        <div class="min-h-screen bg-surface-50 dark:bg-surface-950 p-6">
            <!-- Unlock -->
            <div *ngIf="!unlocked()" class="max-w-md mx-auto mt-20 rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-8">
                <h1 class="text-xl font-bold mb-1">Platform Admin</h1>
                <p class="text-sm text-muted-color mb-4">Enter your admin API key to continue.</p>
                <form (ngSubmit)="unlock()" class="flex flex-col gap-3">
                    <input type="password" required [(ngModel)]="keyInput" name="key" placeholder="x-admin-api-key" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" />
                    <button type="submit" class="py-2 rounded-lg bg-primary text-primary-contrast">Unlock</button>
                </form>
            </div>

            <!-- Unlocked -->
            <div *ngIf="unlocked()" class="max-w-6xl mx-auto flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <h1 class="text-2xl font-bold">Platform Admin</h1>
                    <div class="flex gap-2">
                        <a routerLink="/admin/onboard" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast text-sm">+ New shop</a>
                        <button type="button" class="px-4 py-2 rounded-lg border border-surface text-sm" (click)="refresh()">Refresh</button>
                        <button type="button" class="px-4 py-2 rounded-lg border border-surface text-sm" (click)="lock()">Lock</button>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <!-- Tenant registry -->
                    <div class="lg:col-span-2 rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                        <h2 class="font-bold mb-3">Tenants</h2>
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Shop</th><th>Subdomain</th><th>Plan</th><th>Status</th><th class="text-right">Actions</th></tr></thead>
                            <tbody>
                                <tr *ngFor="let t of tenants()" class="border-b border-surface/50">
                                    <td class="py-2 font-medium">{{ t.shopName }}</td>
                                    <td class="text-muted-color">{{ t.subdomain }}</td>
                                    <td>
                                        <select [ngModel]="t.planId" (ngModelChange)="changePlan(t, $event)" class="px-2 py-1 rounded border border-surface bg-surface-0 dark:bg-surface-900 text-xs">
                                            <option *ngFor="let p of plans()" [value]="p.id">{{ p.planName }}</option></select>
                                    </td>
                                    <td><span class="text-[11px] px-2 py-0.5 rounded-full" [class.bg-emerald-100]="t.status === 'ACTIVE'" [class.text-emerald-600]="t.status === 'ACTIVE'" [class.bg-rose-100]="t.status !== 'ACTIVE'" [class.text-rose-600]="t.status !== 'ACTIVE'">{{ t.status }}</span></td>
                                    <td class="text-right"><button type="button" class="text-primary text-xs" (click)="toggleStatus(t)">{{ t.status === 'ACTIVE' ? 'Suspend' : 'Activate' }}</button></td>
                                </tr>
                                <tr *ngIf="!tenants().length"><td colspan="5" class="text-center text-muted-color py-4">No tenants</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Plan manager -->
                    <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                        <h2 class="font-bold mb-3">Plans</h2>
                        <div class="flex flex-col gap-2 mb-4">
                            <div *ngFor="let p of plans()" class="rounded-xl border border-surface p-3">
                                <div class="flex items-center justify-between">
                                    <div class="font-medium">{{ p.planName }}</div>
                                    <div class="flex gap-2"><button type="button" class="text-primary text-xs" (click)="editPlan(p)">Edit</button><button type="button" class="text-rose-500 text-xs" (click)="deletePlan(p)">Delete</button></div>
                                </div>
                                <div class="text-xs text-muted-color">{{ p.maxUsers }} users · {{ p.maxProducts }} products · {{ p.maxLocations }} locations · {{ p.monthlyPrice }}/mo</div>
                            </div>
                        </div>

                        <h3 class="font-semibold text-sm mb-2">{{ editingPlanId ? 'Edit' : 'New' }} plan</h3>
                        <form (ngSubmit)="savePlan()" class="flex flex-col gap-2">
                            <input required [(ngModel)]="planForm.planName" name="pn" placeholder="Plan name" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                            <div class="grid grid-cols-2 gap-2">
                                <input type="number" min="1" [(ngModel)]="planForm.maxUsers" name="mu" placeholder="Max users" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                                <input type="number" min="1" [(ngModel)]="planForm.maxProducts" name="mp" placeholder="Max products" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                                <input type="number" min="1" [(ngModel)]="planForm.maxLocations" name="ml" placeholder="Max locations" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                                <input type="number" min="0" step="0.01" [(ngModel)]="planForm.monthlyPrice" name="price" placeholder="Monthly price" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                            </div>
                            <div class="grid grid-cols-1 gap-1 max-h-40 overflow-auto border border-surface rounded-lg p-2">
                                <label *ngFor="let f of featureCatalog" class="flex items-center gap-2 text-xs"><input type="checkbox" [checked]="planForm.features.includes(f.key)" (change)="toggleFeature(f.key)" /> {{ f.label }} <span class="text-muted-color">({{ f.tier }})</span></label>
                            </div>
                            <div class="flex gap-2">
                                <button type="submit" class="flex-1 py-2 rounded-lg bg-primary text-primary-contrast text-sm">Save plan</button>
                                <button type="button" *ngIf="editingPlanId" class="px-3 py-2 rounded-lg border border-surface text-sm" (click)="resetPlan()">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `
})
export class AdminPanelComponent implements OnInit {
    private service = inject(TenantsService);
    private notify = inject(NotifyService);

    featureCatalog = FEATURE_CATALOG;
    unlocked = signal(false);
    keyInput = '';
    tenants = signal<Tenant[]>([]);
    plans = signal<SubscriptionPlan[]>([]);

    editingPlanId: string | null = null;
    planForm: PlanInput = this.emptyPlan();

    private get apiKey(): string {
        return sessionStorage.getItem(ADMIN_KEY) ?? '';
    }

    ngOnInit(): void {
        if (this.apiKey) {
            this.unlocked.set(true);
            this.refresh();
        }
    }

    private emptyPlan(): PlanInput {
        return { planName: '', maxUsers: 1, maxProducts: 50, maxLocations: 1, monthlyPrice: 0, features: [] };
    }

    unlock(): void {
        if (!this.keyInput.trim()) return;
        sessionStorage.setItem(ADMIN_KEY, this.keyInput.trim());
        this.unlocked.set(true);
        this.refresh();
    }

    lock(): void {
        sessionStorage.removeItem(ADMIN_KEY);
        this.unlocked.set(false);
        this.tenants.set([]);
        this.plans.set([]);
    }

    async refresh(): Promise<void> {
        try {
            const [tenants, plans] = await Promise.all([
                this.service.listTenants(this.apiKey),
                this.service.listPublicPlans().catch(() => [])
            ]);
            this.tenants.set(tenants ?? []);
            this.plans.set(plans ?? []);
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async changePlan(t: Tenant, planId: string): Promise<void> {
        try {
            await this.service.updateTenant(this.apiKey, t.id, { planId });
            this.notify.success(`${t.shopName} plan updated`);
            this.refresh();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async toggleStatus(t: Tenant): Promise<void> {
        const status = t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        try {
            await this.service.updateTenant(this.apiKey, t.id, { status });
            this.notify.success(`${t.shopName} ${status.toLowerCase()}`);
            this.refresh();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    editPlan(p: SubscriptionPlan): void {
        this.editingPlanId = p.id;
        this.planForm = { planName: p.planName, maxUsers: p.maxUsers, maxProducts: p.maxProducts, maxLocations: p.maxLocations, monthlyPrice: p.monthlyPrice, features: [...p.features] };
    }

    resetPlan(): void {
        this.editingPlanId = null;
        this.planForm = this.emptyPlan();
    }

    toggleFeature(key: FeatureKey): void {
        const has = this.planForm.features.includes(key);
        this.planForm.features = has ? this.planForm.features.filter((f) => f !== key) : [...this.planForm.features, key];
    }

    async savePlan(): Promise<void> {
        try {
            if (this.editingPlanId) await this.service.updatePlan(this.apiKey, this.editingPlanId, this.planForm);
            else await this.service.createPlan(this.apiKey, this.planForm);
            this.notify.success('Plan saved');
            this.resetPlan();
            this.refresh();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async deletePlan(p: SubscriptionPlan): Promise<void> {
        if (!(await this.notify.confirm(`Delete plan ${p.planName}?`, 'Delete plan'))) return;
        try {
            await this.service.deletePlan(this.apiKey, p.id);
            this.notify.success('Plan deleted');
            this.refresh();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
