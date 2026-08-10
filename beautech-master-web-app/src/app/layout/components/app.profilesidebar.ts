import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';
import { LayoutService } from '@/layout/service/layout.service';
import { AuthStore } from '@/pos/stores/auth.store';
import { AuthService } from '@/pos/services/auth.service';
import { EmployeesService } from '@/pos/services/employees.service';
import { LocationsService } from '@/pos/services/locations.service';
import { CatalogService } from '@/pos/services/catalog.service';
import { SyncStore } from '@/pos/stores/sync.store';
import { NotifyService } from '@/pos/core/notify.service';
import { apiErrorMessage } from '@/pos/core/api';
import type { AuthBranch } from '@/pos/core/types';

@Component({
    selector: 'app-profilesidebar',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule],
    template: `
        <div class="flex flex-col mx-auto md:mx-0">
            <div class="flex items-center gap-3 mb-6">
                <div class="h-12 w-12 rounded-full bg-primary text-primary-contrast flex items-center justify-center text-lg font-bold">{{ initials() }}</div>
                <div>
                    <div class="font-semibold">{{ auth.user()?.fullName || 'Guest' }}</div>
                    <div class="text-surface-500 dark:text-surface-400 text-sm">{{ auth.user()?.email }}</div>
                    <span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700">{{ auth.user()?.role }}</span>
                </div>
            </div>

            <div class="mb-6" *ngIf="canSwitchBranch()">
                <label class="text-xs uppercase tracking-wider text-surface-500 mb-1 block">Active branch</label>
                <select [(ngModel)]="selectedBranchId" (ngModelChange)="switchBranch($event)"
                    class="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 text-sm">
                    <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.type }})</option>
                </select>
            </div>

            <div *ngIf="syncStore.pendingCount() > 0" class="mb-3 text-xs text-amber-600">
                ⚠ {{ syncStore.pendingCount() }} transaction(s) pending sync. They will be lost on logout if not flushed.
            </div>

            <button pButton type="button" class="w-full" severity="danger" (click)="logout()">
                <i class="pi pi-sign-out mr-2"></i> Logout
            </button>
        </div>
    `
})
export class AppProfileSidebar implements OnInit {
    layoutService = inject(LayoutService);
    auth = inject(AuthStore);
    syncStore = inject(SyncStore);
    private authService = inject(AuthService);
    private employees = inject(EmployeesService);
    private locations = inject(LocationsService);
    private catalog = inject(CatalogService);
    private notify = inject(NotifyService);
    private router = inject(Router);

    branches = signal<AuthBranch[]>([]);
    selectedBranchId = '';

    initials(): string {
        const name = this.auth.user()?.fullName ?? '';
        return name
            .split(' ')
            .map((n) => n.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'G';
    }

    canSwitchBranch(): boolean {
        const role = this.auth.role();
        return role === 'OWNER' || role === 'MANAGER';
    }

    ngOnInit(): void {
        this.selectedBranchId = this.auth.branch()?.id ?? '';
        if (this.canSwitchBranch() && this.auth.accessToken()) {
            this.locations.listLocations().then((l) => this.branches.set(l ?? [])).catch(() => {});
        }
    }

    async switchBranch(branchId: string): Promise<void> {
        if (!branchId || branchId === this.auth.branch()?.id) return;
        try {
            await this.employees.switchMyBranch(branchId);
            await this.catalog.pullCatalog();
            this.notify.success('Branch switched');
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async logout(): Promise<void> {
        if (this.syncStore.pendingCount() > 0) {
            const ok = await this.notify.confirm(
                `${this.syncStore.pendingCount()} unsynced transaction(s) will be lost. Logout anyway?`,
                'Pending sync'
            );
            if (!ok) return;
        }
        await this.authService.logout();
        this.layoutService.layoutState.update((s) => ({ ...s, profileSidebarVisible: false }));
        this.router.navigate(['/login']);
    }
}
