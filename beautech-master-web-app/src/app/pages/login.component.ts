/**
 * Sign in on a shared device.
 *
 * Pick the outlet, tap your name, key in a PIN. Nobody types an email address
 * on a wet tablet in a store room with a delivery waiting, which is why the
 * schema stores a PIN and not a password.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { ROLE_LABELS, type LocationRef, type Role } from '@/core/types';

interface Tile {
    id: number;
    name: string;
    role: Role;
    locationId: number | null;
}

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    template: `
        <div class="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 p-4">
            <div class="w-full max-w-3xl">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold text-surface-900 dark:text-surface-0">The Grand</h1>
                    <p class="text-surface-500 mt-1">Inventory</p>
                </div>

                <div class="bg-surface-0 dark:bg-surface-900 border border-surface rounded-2xl p-6 md:p-8">
                    <!-- Step 1: which outlet -->
                    @if (step() === 'location') {
                        <h2 class="text-lg font-semibold mb-4">Where are you?</h2>
                        @if (loading()) {
                            <p class="text-surface-500">Loading…</p>
                        } @else if (loadError()) {
                            <div class="text-center py-6">
                                <p class="text-red-600 mb-4">{{ loadError() }}</p>
                                <button pButton label="Try again" (click)="loadBootstrap()"></button>
                            </div>
                        } @else {
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                @for (loc of locations(); track loc.id) {
                                    <button
                                        type="button"
                                        class="p-4 rounded-xl border border-surface hover:border-primary text-left transition"
                                        (click)="pickLocation(loc)">
                                        <div class="font-semibold">{{ loc.name }}</div>
                                        <div class="text-sm text-surface-500">{{ loc.code }}</div>
                                    </button>
                                }
                            </div>
                        }
                    }

                    <!-- Step 2: who are you -->
                    @if (step() === 'user') {
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="text-lg font-semibold">Who are you?</h2>
                            <button pButton text label="Change outlet" (click)="step.set('location')"></button>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            @for (u of usersHere(); track u.id) {
                                <button
                                    type="button"
                                    class="p-4 rounded-xl border border-surface hover:border-primary text-center transition"
                                    (click)="pickUser(u)">
                                    <div class="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center mx-auto mb-2 font-semibold">
                                        {{ initials(u.name) }}
                                    </div>
                                    <div class="font-medium text-sm">{{ u.name }}</div>
                                    <div class="text-xs text-surface-500">{{ roleLabel(u.role) }}</div>
                                </button>
                            }
                            @if (usersHere().length === 0) {
                                <p class="col-span-full text-surface-500">Nobody is assigned to this outlet yet.</p>
                            }
                        </div>
                    }

                    <!-- Step 3: PIN -->
                    @if (step() === 'pin') {
                        <div class="max-w-xs mx-auto text-center">
                            <div class="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center mx-auto mb-3 text-xl font-semibold">
                                {{ initials(selectedUser()!.name) }}
                            </div>
                            <div class="font-semibold">{{ selectedUser()!.name }}</div>
                            <div class="text-sm text-surface-500 mb-5">{{ selectedLocation()?.name }}</div>

                            <div class="flex justify-center gap-3 mb-6" aria-label="PIN entry">
                                @for (i of [0, 1, 2, 3]; track i) {
                                    <div
                                        class="w-4 h-4 rounded-full border-2"
                                        [class.bg-primary]="pin().length > i"
                                        [class.border-primary]="pin().length > i"
                                        [class.border-surface-300]="pin().length <= i"></div>
                                }
                            </div>

                            <div class="grid grid-cols-3 gap-3">
                                @for (d of ['1','2','3','4','5','6','7','8','9']; track d) {
                                    <button
                                        type="button"
                                        class="h-14 rounded-xl border border-surface text-xl font-medium hover:bg-surface-100 dark:hover:bg-surface-800"
                                        [disabled]="submitting()"
                                        (click)="press(d)">{{ d }}</button>
                                }
                                <button
                                    type="button"
                                    class="h-14 rounded-xl text-sm text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800"
                                    (click)="back()">Back</button>
                                <button
                                    type="button"
                                    class="h-14 rounded-xl border border-surface text-xl font-medium hover:bg-surface-100 dark:hover:bg-surface-800"
                                    [disabled]="submitting()"
                                    (click)="press('0')">0</button>
                                <button
                                    type="button"
                                    class="h-14 rounded-xl text-sm text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800"
                                    [disabled]="submitting()"
                                    (click)="backspace()">Delete</button>
                            </div>

                            @if (error()) {
                                <p class="text-red-600 text-sm mt-4">{{ error() }}</p>
                            }
                            @if (submitting()) {
                                <p class="text-surface-500 text-sm mt-4">Signing in…</p>
                            }
                        </div>
                    }
                </div>
            </div>
        </div>
    `
})
export class LoginComponent implements OnInit {
    private api = inject(GrandService);
    private auth = inject(AuthStore);
    private router = inject(Router);
    private notify = inject(NotifyService);

    readonly step = signal<'location' | 'user' | 'pin'>('location');
    readonly loading = signal(false);
    readonly loadError = signal<string | null>(null);
    readonly submitting = signal(false);
    readonly error = signal<string | null>(null);
    readonly pin = signal('');

    readonly locations = signal<LocationRef[]>([]);
    private allUsers = signal<Tile[]>([]);
    readonly selectedLocation = signal<LocationRef | null>(null);
    readonly selectedUser = signal<Tile | null>(null);

    /** Outlet staff plus group-wide roles, who can sign in anywhere. */
    readonly usersHere = computed(() => {
        const locId = this.selectedLocation()?.id;
        return this.allUsers().filter((u) => u.locationId === locId || u.locationId === null);
    });

    ngOnInit(): void {
        void this.loadBootstrap();
    }

    async loadBootstrap(): Promise<void> {
        this.loading.set(true);
        this.loadError.set(null);
        try {
            const data = await this.api.bootstrap();
            this.locations.set(data.locations);
            this.allUsers.set(data.users);
            if (data.locations.length === 1) this.pickLocation(data.locations[0]);
        } catch (err) {
            this.loadError.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    pickLocation(loc: LocationRef): void {
        this.selectedLocation.set(loc);
        this.step.set('user');
    }

    pickUser(user: Tile): void {
        this.selectedUser.set(user);
        this.pin.set('');
        this.error.set(null);
        this.step.set('pin');
    }

    back(): void {
        this.pin.set('');
        this.error.set(null);
        this.step.set('user');
    }

    backspace(): void {
        this.pin.update((p) => p.slice(0, -1));
        this.error.set(null);
    }

    press(digit: string): void {
        if (this.pin().length >= 4) return;
        this.pin.update((p) => p + digit);
        this.error.set(null);
        if (this.pin().length === 4) void this.submit();
    }

    private async submit(): Promise<void> {
        const user = this.selectedUser();
        const loc = this.selectedLocation();
        if (!user || !loc) return;

        this.submitting.set(true);
        try {
            const session = await this.api.login(user.id, loc.id, this.pin());
            this.auth.setSession(session);
            this.notify.success(`Welcome, ${session.user.name}`);
            await this.router.navigate(['/home']);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
            this.pin.set('');
        } finally {
            this.submitting.set(false);
        }
    }

    initials(name: string): string {
        return name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '')
            .join('');
    }

    roleLabel(role: Role): string {
        return ROLE_LABELS[role] ?? role;
    }
}
