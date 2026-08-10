/** New tenant registration wizard (FRONTEND_DOCUMENTATION.md §2.3 OnboardShop). */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TenantsService } from '../../services/tenants.service';
import { NotifyService } from '../../core/notify.service';
import { apiErrorMessage } from '../../core/api';
import type { OnboardingResult, SubscriptionPlan } from '../../core/types';

const ADMIN_KEY = 'pos-admin-key';
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

@Component({
    selector: 'pos-onboard-shop',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    template: `
        <div class="min-h-screen bg-surface-50 dark:bg-surface-950 p-6">
            <div class="max-w-2xl mx-auto">
                <a routerLink="/admin" class="text-sm text-primary">← Back to admin</a>
                <h1 class="text-2xl font-bold mt-2 mb-4">Onboard a new shop</h1>

                <div *ngIf="result() as r" class="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-6 mb-4">
                    <h2 class="font-bold text-emerald-700 mb-1">Shop created!</h2>
                    <p class="text-sm">Tenant ID (click to copy):</p>
                    <button type="button" class="font-mono text-sm underline" (click)="copy(r.tenant.id)">{{ r.tenant.id }}</button>
                    <p class="text-sm mt-1">Owner: {{ r.owner.email }}</p>
                </div>

                <form (ngSubmit)="submit()" class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-6 flex flex-col gap-4">
                    <h3 class="font-semibold">Shop details</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Shop name</span><input required [(ngModel)]="form.shopName" name="shopName" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Subdomain</span><input required [(ngModel)]="form.subdomain" name="subdomain" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Plan</span><select [(ngModel)]="form.planId" name="planId" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option value="" disabled>Select plan</option><option *ngFor="let p of plans()" [value]="p.id">{{ p.planName }}</option></select></label>
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Currency</span><input required [(ngModel)]="form.currencyCode" name="currency" list="currencies" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" />
                            <datalist id="currencies"><option *ngFor="let c of currencies" [value]="c"></option></datalist></label>
                    </div>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Logo (max 1MB)</span><input type="file" accept="image/*" (change)="onLogo($event)" class="text-sm" /></label>

                    <h3 class="font-semibold mt-2">Owner account</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Full name</span><input required [(ngModel)]="form.ownerFullName" name="ofn" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Email</span><input required type="email" [(ngModel)]="form.ownerEmail" name="oe" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                        <label class="flex flex-col gap-1 text-sm col-span-2"><span class="text-xs uppercase tracking-wider text-muted-color">Password (min 8)</span><input required minlength="8" type="password" [(ngModel)]="form.ownerPassword" name="op" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    </div>

                    <p *ngIf="error()" class="text-sm text-rose-600">{{ error() }}</p>
                    <button type="submit" class="py-2.5 rounded-lg bg-primary text-primary-contrast" [disabled]="busy()">{{ busy() ? 'Creating…' : 'Create shop' }}</button>
                </form>
            </div>
        </div>
    `
})
export class OnboardShopComponent implements OnInit {
    private service = inject(TenantsService);
    private notify = inject(NotifyService);
    private router = inject(Router);

    currencies = ['USD', 'EUR', 'GBP', 'LKR', 'INR', 'AUD', 'CAD', 'JPY', 'AED', 'SGD'];
    plans = signal<SubscriptionPlan[]>([]);
    busy = signal(false);
    error = signal<string | null>(null);
    result = signal<OnboardingResult | null>(null);

    form = {
        shopName: '',
        subdomain: '',
        planId: '',
        currencyCode: 'USD',
        logo: null as string | null,
        ownerFullName: '',
        ownerEmail: '',
        ownerPassword: ''
    };

    private get apiKey(): string {
        return sessionStorage.getItem(ADMIN_KEY) ?? '';
    }

    ngOnInit(): void {
        if (!this.apiKey) {
            this.router.navigate(['/admin']);
            return;
        }
        this.service
            .listPublicPlans()
            .then((p) => this.plans.set(p ?? []))
            .catch(() => this.plans.set([]));
    }

    onLogo(e: Event): void {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
            this.notify.error('Logo must be under 1MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => (this.form.logo = reader.result as string);
        reader.readAsDataURL(file);
    }

    async submit(): Promise<void> {
        this.error.set(null);
        if (!SUBDOMAIN_RE.test(this.form.subdomain)) {
            this.error.set('Subdomain must be lowercase letters, numbers, and hyphens.');
            return;
        }
        this.busy.set(true);
        try {
            const res = await this.service.onboardTenant(this.apiKey, this.form);
            this.result.set(res);
            this.notify.success('Shop onboarded');
        } catch (e) {
            this.error.set(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }

    copy(text: string): void {
        navigator.clipboard?.writeText(text);
        this.notify.info('Copied tenant ID');
    }
}
