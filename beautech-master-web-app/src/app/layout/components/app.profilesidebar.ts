import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';
import { LayoutService } from '@/layout/service/layout.service';
import { AuthStore } from '@/core/auth.store';
import { NotifyService } from '@/core/notify.service';
import { ROLE_LABELS } from '@/core/types';

/**
 * Who is signed in, which outlet they are working in, and the way out.
 *
 * Branch switching is gone for now: changing the active location changes what
 * the token is allowed to touch, so it re-runs login rather than being a
 * dropdown that silently rewrites a header. It returns as a proper flow when
 * Phase 4 adds the second outlet.
 */
@Component({
    selector: 'app-profilesidebar',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule],
    template: `
        <div class="flex flex-col mx-auto md:mx-0">
            <div class="flex items-center gap-3 mb-6">
                <div class="h-12 w-12 rounded-full bg-primary text-primary-contrast flex items-center justify-center text-lg font-bold">
                    {{ initials() }}
                </div>
                <div>
                    <div class="font-semibold">{{ auth.user()?.name || 'Guest' }}</div>
                    <span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700">
                        {{ roleLabel() }}
                    </span>
                </div>
            </div>

            <div class="mb-6">
                <label class="text-xs uppercase tracking-wider text-surface-500 mb-1 block">Outlet</label>
                <div class="text-sm font-medium">{{ auth.location()?.name || '-' }}</div>
                <div class="text-xs text-surface-500">
                    Business day starts {{ auth.location()?.dayStart || '06:00' }}
                </div>
            </div>

            <button pButton type="button" class="w-full" severity="danger" (click)="logout()">
                <i class="pi pi-sign-out mr-2"></i> Sign out
            </button>
        </div>
    `
})
export class AppProfileSidebar {
    layoutService = inject(LayoutService);
    auth = inject(AuthStore);
    private notify = inject(NotifyService);
    private router = inject(Router);

    readonly roleLabel = computed(() => {
        const role = this.auth.role();
        return role ? ROLE_LABELS[role] : '';
    });

    readonly initials = computed(() => {
        const name = this.auth.user()?.name ?? '';
        return (
            name
                .split(' ')
                .filter(Boolean)
                .map((n) => n.charAt(0))
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'G'
        );
    });

    async logout(): Promise<void> {
        const ok = await this.notify.confirm('Sign out of this device?', 'Sign out');
        if (!ok) return;
        this.auth.clearSession();
        this.layoutService.layoutState.update((s) => ({ ...s, profileSidebarVisible: false }));
        void this.router.navigate(['/login']);
    }
}

