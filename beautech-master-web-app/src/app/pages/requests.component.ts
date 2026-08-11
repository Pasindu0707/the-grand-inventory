/**
 * Requests — one screen, three jobs, decided by who is looking.
 *
 * The storekeeper sees things to release. The kitchen sees things to confirm.
 * Management sees both. Nobody sees a tab they have no business in, and the
 * thing that needs doing is always at the top with a coloured button.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import { uuid } from '@/core/uuid';
import type { IssueDetail, MyContext, RequestRow } from '@/core/types';

@Component({
    selector: 'app-requests',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, ButtonModule, InputNumberModule, TagModule],
    template: `
        <div class="space-y-6 max-w-4xl">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Requests</h1>
                    <p class="text-surface-500 text-sm">{{ auth.location()?.name }}</p>
                </div>
                @if (canAsk()) {
                    <button pButton icon="pi pi-plus" label="Ask for stock" routerLink="/ask"></button>
                }
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <!-- Releasing -->
            @if (open(); as detail) {
                <div class="rounded-2xl border-2 border-primary bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                    <div class="flex items-center justify-between">
                        <h2 class="text-lg font-semibold">Release to {{ openSectionName() }}</h2>
                        <button pButton text label="Close" (click)="open.set(null)"></button>
                    </div>

                    @for (line of detail.lines; track line.lineId) {
                        <div class="flex flex-wrap items-end justify-between gap-3 pb-3 border-b border-surface">
                            <div class="min-w-0">
                                <div class="font-medium text-lg">{{ line.name }}</div>
                                <div class="text-sm text-surface-500">
                                    asked for {{ q(line.qtyRequested, line.stockUnit) }} ·
                                    store has
                                    <span
                                        [class.text-red-600]="line.availableInStore < line.qtyRequested"
                                        [class.font-semibold]="line.availableInStore < line.qtyRequested">
                                        {{ q(line.availableInStore, line.stockUnit) }}
                                    </span>
                                </div>
                            </div>
                            <div class="w-40">
                                <label class="block text-xs text-surface-500 mb-1">Giving</label>
                                <p-inputNumber
                                    styleClass="w-full"
                                    inputStyleClass="py-3 text-base"
                                    [ngModel]="giving()[line.lineId]"
                                    (ngModelChange)="setGiving(line.lineId, $event)"
                                    [min]="0"
                                    [maxFractionDigits]="3"></p-inputNumber>
                            </div>
                        </div>
                    }

                    <div class="flex justify-end">
                        <button
                            pButton
                            size="large"
                            icon="pi pi-check"
                            label="Release these"
                            [disabled]="busy()"
                            [loading]="busy()"
                            (click)="doRelease(detail)"></button>
                    </div>
                </div>
            }

            <!-- The list -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                <div class="p-4 flex flex-wrap items-center gap-2 border-b border-surface">
                    <button pButton size="small" [outlined]="filter() !== 'needsMe'" label="Needs me" (click)="setFilter('needsMe')"></button>
                    <button pButton size="small" [outlined]="filter() !== 'requested'" label="Waiting" (click)="setFilter('requested')"></button>
                    <button pButton size="small" [outlined]="filter() !== 'released'" label="Released" (click)="setFilter('released')"></button>
                    <button pButton size="small" [outlined]="filter() !== 'all'" label="All" (click)="setFilter('all')"></button>
                </div>

                @if (visible().length === 0) {
                    <p class="p-10 text-center text-surface-500">
                        {{ loading() ? 'Loading…' : 'Nothing here.' }}
                    </p>
                } @else {
                    <ul class="divide-y divide-surface">
                        @for (row of visible(); track row.id) {
                            <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="font-medium">
                                        {{ row.sectionName }} · {{ row.lineCount }} item(s)
                                    </div>
                                    <div class="text-xs text-surface-500">
                                        {{ row.requestedBy }} · {{ when(row.requestedAt) }}
                                        @if (row.neededBy) {
                                            · <span class="font-semibold">needed by {{ row.neededBy }}</span>
                                        }
                                    </div>
                                    @if (row.note) {
                                        <div class="text-xs text-surface-500 italic mt-0.5">“{{ row.note }}”</div>
                                    }
                                </div>

                                <div class="flex items-center gap-2">
                                    <p-tag [severity]="tone(row.status)" [value]="label(row.status)"></p-tag>

                                    @if (row.status === 'requested' && ctx()?.canRelease) {
                                        <button pButton size="small" label="Release" (click)="startRelease(row)"></button>
                                    }
                                    @if (row.status === 'released' && row.isMine) {
                                        <button
                                            pButton
                                            size="small"
                                            severity="success"
                                            label="It came"
                                            (click)="confirm(row)"></button>
                                    }
                                    @if (row.status === 'requested' && row.isMine) {
                                        <button pButton size="small" text severity="danger" label="Cancel" (click)="cancel(row)"></button>
                                    }
                                </div>
                            </li>
                        }
                    </ul>
                }
            </div>
        </div>
    `
})
export class RequestsComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly rows = signal<RequestRow[]>([]);
    readonly ctx = signal<MyContext | null>(null);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);
    readonly filter = signal<'needsMe' | 'requested' | 'released' | 'all'>('needsMe');

    readonly open = signal<IssueDetail | null>(null);
    readonly openSectionName = signal('');
    readonly giving = signal<Record<string, number>>({});
    private releaseKey = uuid();

    readonly canAsk = computed(() => {
        const role = this.auth.role();
        return role === 'kitchen' || role === 'cleaning' || role === 'management';
    });

    readonly visible = computed(() => {
        const rows = this.rows();
        switch (this.filter()) {
            case 'needsMe':
                return rows.filter((r) => r.needsMe);
            case 'requested':
                return rows.filter((r) => r.status === 'requested');
            case 'released':
                return rows.filter((r) => r.status === 'released');
            default:
                return rows;
        }
    });

    async ngOnInit(): Promise<void> {
        try {
            this.ctx.set(await this.api.myContext());
        } catch {
            /* the list still works without it */
        }
        await this.load();

        // Land on whatever actually has something in it, rather than an empty
        // "Needs me" that looks broken.
        if (this.visible().length === 0 && this.rows().length > 0) this.filter.set('all');
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            this.rows.set(await this.api.listRequests());
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    setFilter(f: 'needsMe' | 'requested' | 'released' | 'all'): void {
        this.filter.set(f);
    }

    label(status: string): string {
        return (
            { requested: 'Waiting', released: 'Released', received: 'Done', cancelled: 'Cancelled' }[
                status
            ] ?? status
        );
    }

    tone(status: string): 'success' | 'warn' | 'info' | 'danger' | 'secondary' {
        return status === 'received'
            ? 'success'
            : status === 'released'
              ? 'info'
              : status === 'cancelled'
                ? 'danger'
                : 'warn';
    }

    async startRelease(row: RequestRow): Promise<void> {
        this.releaseKey = uuid();
        this.openSectionName.set(row.sectionName);
        try {
            const detail = await this.api.getRequest(row.id);
            this.open.set(detail);
            // Prefill with what they asked for, capped at what is actually
            // there — the sensible answer, still editable.
            const seed: Record<string, number> = {};
            for (const line of detail.lines) {
                seed[line.lineId] = Math.min(line.qtyRequested, Math.max(0, line.availableInStore));
            }
            this.giving.set(seed);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }

    setGiving(lineId: string, qty: number | null): void {
        this.giving.update((m) => ({ ...m, [lineId]: qty ?? 0 }));
    }

    async doRelease(detail: IssueDetail): Promise<void> {
        this.busy.set(true);
        try {
            const result = await this.api.releaseRequest(
                detail.id,
                detail.lines.map((l) => ({ lineId: l.lineId, qtyIssued: this.giving()[l.lineId] ?? 0 })),
                this.releaseKey
            );

            for (const s of result.shortfalls) {
                this.notify.warning(
                    `${s.itemName}: gave ${s.released} of ${s.requested} — only ${s.available} in the store.`
                );
            }
            if (result.shortfalls.length === 0) {
                this.notify.success('Released');
            }

            this.open.set(null);
            this.releaseKey = uuid();
            await this.load();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async confirm(row: RequestRow): Promise<void> {
        try {
            await this.api.confirmReceived(row.id);
            this.notify.success('Thanks — marked as arrived');
            await this.load();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        }
    }

    async cancel(row: RequestRow): Promise<void> {
        const ok = await this.notify.confirm('Cancel this request?', 'Cancel');
        if (!ok) return;
        try {
            await this.api.cancelRequest(row.id);
            await this.load();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        }
    }

    q(qty: number, unit: string): string {
        return formatQty(qty, unit);
    }

    when(iso: string): string {
        return new Date(iso).toLocaleString('en-LK', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
