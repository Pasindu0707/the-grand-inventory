/** Public login page (FRONTEND_DOCUMENTATION.md §2.3 Login). */
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { apiErrorMessage } from '../core/api';

@Component({
    selector: 'pos-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 p-4">
            <div class="w-full max-w-md rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-8 shadow-sm">
                <div class="text-center mb-6">
                    <div class="mx-auto mb-3 h-12 w-12 rounded-xl bg-primary text-primary-contrast flex items-center justify-center text-xl font-bold">V</div>
                    <h1 class="text-2xl font-bold">VendEasy POS</h1>
                    <p class="text-sm text-muted-color">Sign in to your store</p>
                </div>

                <form (ngSubmit)="submit()" class="flex flex-col gap-4">
                    <div class="flex flex-col gap-1">
                        <label class="text-xs uppercase tracking-wider text-muted-color">Email</label>
                        <input type="email" required [(ngModel)]="email" name="email" autocomplete="username"
                            class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" placeholder="you@store.com" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-xs uppercase tracking-wider text-muted-color">Password</label>
                        <input type="password" required minlength="8" [(ngModel)]="password" name="password" autocomplete="current-password"
                            class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" placeholder="••••••••" />
                    </div>

                    <div *ngIf="error()" class="rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm px-3 py-2">{{ error() }}</div>

                    <button type="submit" [disabled]="busy()"
                        class="w-full py-2.5 rounded-lg bg-primary text-primary-contrast font-medium disabled:opacity-60">
                        {{ busy() ? 'Signing in…' : 'Sign in' }}
                    </button>
                </form>
            </div>
        </div>
    `
})
export class LoginComponent {
    private authService = inject(AuthService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    email = '';
    password = '';
    busy = signal(false);
    error = signal<string | null>(null);

    async submit(): Promise<void> {
        this.busy.set(true);
        this.error.set(null);
        try {
            await this.authService.login(this.email, this.password);
            const from = this.route.snapshot.queryParamMap.get('from') ?? '/register';
            this.router.navigateByUrl(from);
        } catch (e) {
            this.error.set(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }
}
