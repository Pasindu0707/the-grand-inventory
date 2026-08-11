/**
 * What we have.
 *
 * For a kitchen or cleaning login this is their own section and nothing else.
 * For the storekeeper it is every section at the branch, grouped, because
 * "what does the kitchen still have" is the question they get asked all day.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import type { MyContext, StockRow } from '@/core/types';

@Component({
    selector: 'app-my-stock',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, ButtonModule, InputTextModule],
    template: `
        <div class="space-y-6 max-w-4xl">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">{{ title() }}</h1>
                    <p class="text-surface-500 text-sm">{{ auth.location()?.name }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        pInputText
                        type="search"
                        placeholder="Search"
                        class="w-48"
                        [ngModel]="search()"
                        (ngModelChange)="search.set($event)" />
                    <button pButton text icon="pi pi-refresh" (click)="load()" [disabled]="loading()"></button>
                </div>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            @for (group of groups(); track group.sectionCode) {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                    @if (groups().length > 1) {
                        <div class="p-4 border-b border-surface font-semibold">
                            {{ sectionLabel(group.sectionCode) }}
                            <span class="text-surface-500 font-normal text-sm">
                                · {{ group.rows.length }} item(s)
                            </span>
                        </div>
                    }

                    @if (group.rows.length === 0) {
                        <p class="p-10 text-center text-surface-500">Nothing here.</p>
                    } @else {
                        <ul class="divide-y divide-surface">
                            @for (row of group.rows; track row.itemId) {
                                <li class="p-4 flex items-center justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="font-medium">{{ row.name }}</div>
                                        @if (row.belowReorder) {
                                            <div class="text-xs text-red-600 font-medium">Running low</div>
                                        }
                                    </div>
                                    <div class="text-lg font-semibold shrink-0" [class.text-red-600]="row.qtyBase <= 0">
                                        {{ q(row.qtyBase, row.stockUnit) }}
                                    </div>
                                </li>
                            }
                        </ul>
                    }
                </div>
            }

            @if (!loading() && rows().length === 0) {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-10 text-center">
                    <p class="text-surface-500 mb-4">Nothing in here yet.</p>
                    <button pButton label="Ask the store for something" routerLink="/ask"></button>
                </div>
            }
        </div>
    `
})
export class MyStockComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);

    readonly rows = signal<StockRow[]>([]);
    readonly ctx = signal<MyContext | null>(null);
    readonly loading = signal(true);
    readonly error = signal<string | null>(null);
    readonly search = signal('');

    readonly title = computed(() =>
        this.auth.role() === 'storekeeper' || this.auth.role() === 'management'
            ? 'Stock everywhere'
            : 'What we have'
    );

    /** Store first — it is the one people ask about most. */
    readonly groups = computed(() => {
        const term = this.search().toLowerCase().trim();
        const filtered = term
            ? this.rows().filter(
                  (r) => r.name.toLowerCase().includes(term) || r.code.toLowerCase().includes(term)
              )
            : this.rows();

        const bySection = new Map<string, StockRow[]>();
        for (const row of filtered) {
            const list = bySection.get(row.sectionCode) ?? [];
            list.push(row);
            bySection.set(row.sectionCode, list);
        }

        const order = ['STORE', 'KITCHEN', 'BAKERY', 'BAR', 'CLEAN'];
        return [...bySection.entries()]
            .map(([sectionCode, rows]) => ({ sectionCode, rows }))
            .sort((a, b) => order.indexOf(a.sectionCode) - order.indexOf(b.sectionCode));
    });

    async ngOnInit(): Promise<void> {
        try {
            this.ctx.set(await this.api.myContext());
        } catch {
            /* fall back to showing everything the API allows */
        }
        await this.load();
    }

    async load(): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const ctx = this.ctx();
            const res = await this.api.getStock();

            // A kitchen login sees the kitchen. Anyone who can release sees the
            // lot, because that is their job.
            const rows =
                ctx && !ctx.canRelease && ctx.mySectionIds.length > 0
                    ? res.rows.filter((r) => ctx.mySectionIds.includes(r.sectionId))
                    : res.rows;

            this.rows.set(rows);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    sectionLabel(code: string): string {
        return (
            {
                STORE: 'Main store',
                KITCHEN: 'Kitchen',
                BAKERY: 'Bakery',
                BAR: 'Bar',
                CLEAN: 'Cleaning'
            }[code] ?? code
        );
    }

    q(qty: number, unit: string): string {
        return formatQty(qty, unit);
    }
}
