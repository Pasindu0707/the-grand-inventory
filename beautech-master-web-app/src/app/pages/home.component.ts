/**
 * Home. Different for each role, and deliberately short.
 *
 * The old dashboard showed everyone the same wall of numbers. A cleaner does
 * not need a stock valuation; they need "ask for shampoo" and "did my last
 * request arrive". So this screen is a small number of large buttons, and the
 * first one is whatever that person came here to do.
 *
 * Anything waiting on you is shown as a count on the button. That is the whole
 * notification system, and it is enough.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { apiErrorMessage } from '@/core/api';
import { ROLE_LABELS, type MyContext, type PurchaseOrder, type RequestRow } from '@/core/types';

interface Tile {
    label: string;
    hint: string;
    icon: string;
    link: string;
    count?: number;
    primary?: boolean;
}

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
        <div class="space-y-8 max-w-4xl">
            <div>
                <h1 class="text-3xl font-bold">{{ greeting() }}</h1>
                <p class="text-surface-500 mt-1">
                    {{ roleLabel() }} · {{ auth.location()?.name }}
                </p>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                @for (tile of tiles(); track tile.link) {
                    <a
                        [routerLink]="tile.link"
                        class="relative block rounded-2xl border p-6 transition hover:shadow-md"
                        [class.border-primary]="tile.primary"
                        [class.bg-primary-50]="tile.primary"
                        [class.dark:bg-primary-950]="tile.primary"
                        [class.border-surface]="!tile.primary"
                        [class.bg-surface-0]="!tile.primary"
                        [class.dark:bg-surface-900]="!tile.primary">
                        <div class="flex items-start gap-4">
                            <i [class]="tile.icon + ' text-2xl mt-1'" [class.text-primary]="tile.primary"></i>
                            <div class="min-w-0">
                                <div class="text-lg font-semibold">{{ tile.label }}</div>
                                <div class="text-sm text-surface-500 mt-0.5">{{ tile.hint }}</div>
                            </div>
                        </div>
                        @if (tile.count) {
                            <span
                                class="absolute top-4 right-4 min-w-7 h-7 px-2 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center">
                                {{ tile.count }}
                            </span>
                        }
                    </a>
                }
            </div>

            @if (waitingOnMe().length > 0) {
                <div class="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4">
                    <div class="font-semibold text-amber-900 dark:text-amber-200 mb-2">
                        Waiting for you
                    </div>
                    <ul class="space-y-1 text-sm text-amber-900 dark:text-amber-200">
                        @for (r of waitingOnMe().slice(0, 5); track r.id) {
                            <li>
                                {{ r.sectionName }} · {{ r.lineCount }} item(s)
                                @if (r.status === 'requested') {
                                    — needs releasing
                                } @else {
                                    — released, needs confirming
                                }
                                @if (r.neededBy) {
                                    <span class="font-semibold">by {{ r.neededBy }}</span>
                                }
                            </li>
                        }
                    </ul>
                </div>
            }
        </div>
    `
})
export class HomeComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);

    readonly ctx = signal<MyContext | null>(null);
    readonly requests = signal<RequestRow[]>([]);
    readonly purchases = signal<PurchaseOrder[]>([]);
    readonly error = signal<string | null>(null);

    readonly greeting = computed(() => {
        const name = this.auth.user()?.name.split(' ')[0] ?? '';
        const hour = new Date().getHours();
        const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        return `${part}, ${name}`;
    });

    readonly roleLabel = computed(() => {
        const role = this.auth.role();
        return role ? ROLE_LABELS[role] : '';
    });

    readonly waitingOnMe = computed(() => this.requests().filter((r) => r.needsMe));

    readonly tiles = computed<Tile[]>(() => {
        const ctx = this.ctx();
        const role = this.auth.role();
        if (!ctx || !role) return [];

        const toRelease = this.requests().filter((r) => r.status === 'requested').length;
        const toConfirm = this.requests().filter((r) => r.status === 'released' && r.isMine).length;
        const posWaiting = this.purchases().filter((p) => p.status === 'requested').length;

        if (role === 'admin') {
            return [
                {
                    label: 'Manage logins',
                    hint: 'Add or remove people, reset a PIN',
                    icon: 'pi pi-users',
                    link: '/users',
                    primary: true
                }
            ];
        }

        const tiles: Tile[] = [];

        // Sections lead with asking, because that is why they open the app.
        if (role === 'kitchen' || role === 'cleaning') {
            tiles.push({
                label: 'Ask for stock',
                hint: 'Request what you need, and when you need it',
                icon: 'pi pi-plus-circle',
                link: '/ask',
                primary: true
            });
            tiles.push({
                label: 'Confirm arrivals',
                hint: 'Say it came',
                icon: 'pi pi-check-circle',
                link: '/requests',
                count: toConfirm
            });
        }

        if (ctx.canRelease) {
            tiles.push({
                label: 'Requests to release',
                hint: 'Approve and hand over',
                icon: 'pi pi-send',
                link: '/requests',
                count: toRelease,
                primary: role === 'storekeeper'
            });
        }

        tiles.push({
            label: role === 'storekeeper' ? 'Stock everywhere' : 'What we have',
            hint:
                role === 'storekeeper'
                    ? 'Store, kitchen and cleaning'
                    : 'Everything in your section right now',
            icon: 'pi pi-box',
            link: '/mystock'
        });

        tiles.push({
            label: 'Purchases',
            hint: ctx.canDecidePurchases ? 'Approve what needs buying' : 'What you asked to be bought',
            icon: 'pi pi-shopping-cart',
            link: '/purchases',
            count: ctx.canDecidePurchases ? posWaiting : 0
        });

        if (role === 'cleaning' || role === 'management') {
            tiles.push({
                label: 'Cleaning checklist',
                hint: 'Today’s tasks',
                icon: 'pi pi-sparkles',
                link: '/cleaning'
            });
        }

        if (ctx.seesAdvanced) {
            tiles.push({
                label: 'Reports',
                hint: 'Usage, loss, waste, prices, stock-outs',
                icon: 'pi pi-chart-bar',
                link: '/reports'
            });
        }

        return tiles;
    });

    async ngOnInit(): Promise<void> {
        try {
            const ctx = await this.api.myContext();
            this.ctx.set(ctx);

            if (ctx.role !== 'admin') {
                const [requests, purchases] = await Promise.all([
                    this.api.listRequests(),
                    this.api.listPurchaseOrders()
                ]);
                this.requests.set(requests);
                this.purchases.set(purchases);
            }
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }
}
