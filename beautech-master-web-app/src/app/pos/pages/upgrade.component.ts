/** Plan-upgrade prompt shown when a feature gate blocks a route (§2.1 RequireRole). */
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
    selector: 'pos-upgrade',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
        <div class="max-w-lg mx-auto mt-12">
            <div class="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-8 text-center">
                <i class="pi pi-lock text-3xl text-amber-500 mb-3"></i>
                <h2 class="text-xl font-bold mb-2">Feature not available</h2>
                <p class="text-sm text-muted-color">
                    <b>{{ feature }}</b> is not included in your
                    <b>{{ plan || 'current' }}</b> plan. Upgrade to unlock this section.
                </p>
                <a routerLink="/register" class="inline-block mt-5 px-5 py-2 rounded-lg bg-primary text-primary-contrast">Back to Register</a>
            </div>
        </div>
    `
})
export class UpgradeComponent {
    private route = inject(ActivatedRoute);
    feature = this.route.snapshot.queryParamMap.get('feature') ?? 'This feature';
    plan = this.route.snapshot.queryParamMap.get('plan') ?? '';
}
