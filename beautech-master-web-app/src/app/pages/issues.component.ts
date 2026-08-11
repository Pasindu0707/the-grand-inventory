/**
 * Issues: sections ask, the store gives.
 *
 * One screen for both halves, because on a shared tablet the person who taps
 * "request" and the person who taps "issue" are often standing next to each
 * other. What you can do is gated by role, not by a separate route.
 *
 * The issue-window rule is visible here as a hint, and as a warning after the
 * fact — never as a block. An issue that happened at 14:00 happened at 14:00,
 * and refusing to record it would make the stock figure wrong as well.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import { uuid } from '@/core/uuid';
import type { IssueDetail, IssueListRow, IssueWindow, Item } from '@/core/types';

@Component({
    selector: 'app-issues',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputNumberModule, TagModule],
    template: `
        <div class="space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Issues</h1>
                    <p class="text-surface-500 text-sm">
                        Store to section
                        @if (windows().length) {
                            · windows {{ windowList() }}
                        }
                    </p>
                </div>
                <button pButton icon="pi pi-plus" label="New request" (click)="startRequest()"></button>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <!-- New request -->
            @if (requesting()) {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                    <div class="flex items-center justify-between">
                        <h2 class="font-semibold">New request</h2>
                        <button pButton text label="Close" (click)="requesting.set(false)"></button>
                    </div>

                    <div>
                        <label class="block text-sm font-medium mb-1">For section</label>
                        <select
                            class="w-full md:w-64 px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="toSectionId()"
                            (ngModelChange)="toSectionId.set(+$event)">
                            @for (s of requestableSections(); track s.id) {
                                <option [ngValue]="s.id">{{ s.name }}</option>
                            }
                        </select>
                    </div>

                    <div class="space-y-3">
                        @for (line of draft(); track $index; let i = $index) {
                            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-surface pb-3">
                                <div class="md:col-span-7">
                                    <label class="block text-xs text-surface-500 mb-1">Item</label>
                                    <select
                                        class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                        [ngModel]="line.itemId"
                                        (ngModelChange)="setDraftItem(i, +$event)">
                                        <option [ngValue]="null">Choose…</option>
                                        @for (it of items(); track it.id) {
                                            <option [ngValue]="it.id">{{ it.name }}</option>
                                        }
                                    </select>
                                </div>
                                <div class="md:col-span-4">
                                    <label class="block text-xs text-surface-500 mb-1">
                                        Quantity {{ unitFor(line.itemId) }}
                                    </label>
                                    <p-inputNumber
                                        styleClass="w-full"
                                        [ngModel]="line.qty"
                                        (ngModelChange)="setDraftQty(i, $event)"
                                        [min]="0"
                                        [maxFractionDigits]="3"></p-inputNumber>
                                </div>
                                <div class="md:col-span-1 flex justify-end">
                                    <button pButton text severity="danger" icon="pi pi-trash" (click)="removeDraft(i)"></button>
                                </div>
                            </div>
                        }
                    </div>

                    <div class="flex justify-between">
                        <button pButton outlined size="small" icon="pi pi-plus" label="Add item" (click)="addDraft()"></button>
                        <button
                            pButton
                            label="Send request"
                            [disabled]="!canRequest() || busy()"
                            (click)="submitRequest()"></button>
                    </div>
                </div>
            }

            <!-- Fulfil -->
            @if (openIssue(); as issue) {
                <div class="rounded-2xl border border-primary-200 bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                    <div class="flex items-center justify-between">
                        <h2 class="font-semibold">Issue #{{ issue.id }}</h2>
                        <button pButton text label="Close" (click)="openIssue.set(null)"></button>
                    </div>

                    <div class="space-y-3">
                        @for (line of issue.lines; track line.lineId) {
                            <div class="flex flex-wrap items-end justify-between gap-3 border-b border-surface pb-3">
                                <div class="min-w-0">
                                    <div class="font-medium">{{ line.name }}</div>
                                    <div class="text-xs text-surface-500">
                                        asked {{ q(line.qtyRequested, line.stockUnit) }} · store has
                                        <span [class.text-red-600]="line.availableInStore < line.qtyRequested">
                                            {{ q(line.availableInStore, line.stockUnit) }}
                                        </span>
                                    </div>
                                </div>
                                <div class="w-40">
                                    <label class="block text-xs text-surface-500 mb-1">Issue</label>
                                    <p-inputNumber
                                        styleClass="w-full"
                                        [ngModel]="issuing()[line.lineId]"
                                        (ngModelChange)="setIssuing(line.lineId, $event)"
                                        [min]="0"
                                        [maxFractionDigits]="3"></p-inputNumber>
                                </div>
                            </div>
                        }
                    </div>

                    @if (offWindowHint()) {
                        <div class="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 p-3 text-sm">
                            {{ offWindowHint() }}
                        </div>
                    }

                    <div class="flex justify-end">
                        <button
                            pButton
                            label="Issue these"
                            icon="pi pi-check"
                            [disabled]="busy()"
                            (click)="fulfil(issue)"></button>
                    </div>
                </div>
            }

            <!-- List -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                <div class="p-4 flex items-center gap-2 border-b border-surface">
                    <button pButton size="small" [outlined]="filter() !== 'requested'" label="Waiting" (click)="setFilter('requested')"></button>
                    <button pButton size="small" [outlined]="filter() !== 'issued'" label="Issued" (click)="setFilter('issued')"></button>
                    <button pButton size="small" [outlined]="filter() !== ''" label="All" (click)="setFilter('')"></button>
                </div>

                @if (rows().length === 0) {
                    <p class="p-8 text-center text-surface-500">{{ loading() ? 'Loading…' : 'Nothing here.' }}</p>
                } @else {
                    <ul class="divide-y divide-surface">
                        @for (row of rows(); track row.id) {
                            <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="font-medium">{{ row.sectionName }} · {{ row.lineCount }} line(s)</div>
                                    <div class="text-xs text-surface-500">
                                        {{ row.requestedBy }} · {{ when(row.requestedAt) }}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <p-tag
                                        [severity]="row.status === 'issued' ? 'success' : row.status === 'cancelled' ? 'danger' : 'warn'"
                                        [value]="row.status"></p-tag>
                                    @if (row.status === 'requested' && canFulfil()) {
                                        <button pButton size="small" label="Fulfil" (click)="loadIssue(row.id)"></button>
                                        <button pButton size="small" text severity="danger" label="Cancel" (click)="cancel(row.id)"></button>
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
export class IssuesComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly rows = signal<IssueListRow[]>([]);
    readonly items = signal<Item[]>([]);
    readonly windows = signal<IssueWindow[]>([]);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);
    readonly filter = signal<string>('requested');

    readonly requesting = signal(false);
    readonly toSectionId = signal<number | null>(null);
    readonly draft = signal<{ itemId: number | null; qty: number | null }[]>([]);

    readonly openIssue = signal<IssueDetail | null>(null);
    readonly issuing = signal<Record<string, number>>({});

    private fulfilKey = uuid();

    /** The store cannot issue to itself, so it is never a destination. */
    readonly requestableSections = computed(() => this.auth.sections().filter((s) => !s.isStore));

    readonly canFulfil = computed(() =>
        ['owner', 'manager', 'storekeeper'].includes(this.auth.role() ?? '')
    );

    readonly windowList = computed(() => this.windows().map((w) => w.at).join(', '));

    readonly offWindowHint = computed(() => {
        const ws = this.windows();
        if (ws.length === 0) return null;
        const now = new Date();
        const mins = now.getHours() * 60 + now.getMinutes();
        const nearest = Math.min(
            ...ws.map((w) => {
                const [h, m] = w.at.split(':').map(Number);
                return Math.abs(mins - ((h ?? 0) * 60 + (m ?? 0)));
            })
        );
        return nearest <= 45
            ? null
            : `This is outside the usual issue windows (${this.windowList()}). It will still be recorded — add a note if it needs explaining.`;
    });

    async ngOnInit(): Promise<void> {
        await Promise.all([this.load(), this.loadRefs()]);
    }

    private async loadRefs(): Promise<void> {
        try {
            const [items, windows] = await Promise.all([this.api.listItems(), this.api.issueWindows()]);
            this.items.set(items);
            this.windows.set(windows);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            this.rows.set(await this.api.listIssues(this.filter() || undefined));
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    setFilter(value: string): void {
        this.filter.set(value);
        void this.load();
    }

    startRequest(): void {
        this.requesting.set(true);
        this.openIssue.set(null);
        if (this.draft().length === 0) this.addDraft();
        if (this.toSectionId() === null) {
            this.toSectionId.set(this.requestableSections()[0]?.id ?? null);
        }
    }

    addDraft(): void {
        this.draft.update((d) => [...d, { itemId: null, qty: null }]);
    }

    removeDraft(i: number): void {
        this.draft.update((d) => d.filter((_, idx) => idx !== i));
    }

    setDraftItem(i: number, itemId: number): void {
        this.draft.update((d) => d.map((l, idx) => (idx === i ? { ...l, itemId } : l)));
    }

    setDraftQty(i: number, qty: number | null): void {
        this.draft.update((d) => d.map((l, idx) => (idx === i ? { ...l, qty } : l)));
    }

    unitFor(itemId: number | null): string {
        if (itemId === null) return '';
        const item = this.items().find((i) => i.id === itemId);
        return item ? `(${item.stockUnit})` : '';
    }

    canRequest(): boolean {
        return (
            this.toSectionId() !== null &&
            this.draft().length > 0 &&
            this.draft().every((l) => l.itemId !== null && (l.qty ?? 0) > 0)
        );
    }

    async submitRequest(): Promise<void> {
        if (!this.canRequest()) return;
        this.busy.set(true);
        try {
            await this.api.requestIssue(
                this.toSectionId()!,
                this.draft().map((l) => ({ itemId: l.itemId!, qtyRequested: l.qty! }))
            );
            this.notify.success('Request sent to the store');
            this.draft.set([]);
            this.requesting.set(false);
            await this.load();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async loadIssue(id: string): Promise<void> {
        this.requesting.set(false);
        this.fulfilKey = uuid();
        try {
            const detail = await this.api.getIssue(id);
            this.openIssue.set(detail);
            // Default to what was asked for, capped at what the store holds —
            // the storekeeper can override, but the sensible answer is prefilled.
            const seed: Record<string, number> = {};
            for (const line of detail.lines) {
                seed[line.lineId] = Math.min(line.qtyRequested, Math.max(0, line.availableInStore));
            }
            this.issuing.set(seed);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }

    setIssuing(lineId: string, qty: number | null): void {
        this.issuing.update((m) => ({ ...m, [lineId]: qty ?? 0 }));
    }

    async fulfil(issue: IssueDetail): Promise<void> {
        this.busy.set(true);
        try {
            const lines = issue.lines.map((l) => ({
                lineId: l.lineId,
                qtyIssued: this.issuing()[l.lineId] ?? 0
            }));
            const result = await this.api.fulfilIssue(issue.id, lines, this.fulfilKey);

            if (result.windowWarning) this.notify.warning(result.windowWarning);
            for (const s of result.shortfalls) {
                this.notify.warning(
                    `${s.itemName}: asked ${s.requested}, issued ${s.issued} — only ${s.available} in the store.`
                );
            }
            if (!result.windowWarning && result.shortfalls.length === 0) {
                this.notify.success(`Issued ${result.linesIssued} line(s)`);
            }

            this.openIssue.set(null);
            this.fulfilKey = uuid();
            await this.load();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async cancel(id: string): Promise<void> {
        const ok = await this.notify.confirm('Cancel this request?', 'Cancel request');
        if (!ok) return;
        try {
            await this.api.cancelIssue(id);
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
