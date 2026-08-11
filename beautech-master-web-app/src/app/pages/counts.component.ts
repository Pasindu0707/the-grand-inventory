/**
 * Stock counts.
 *
 * Two decisions matter here, and both are about making the count tell the
 * truth rather than making it easy.
 *
 * 1. THE COUNT IS BLIND. The expected quantity is never shown while counting.
 *    If you show someone that the system expects 4,500 g, a tired storekeeper
 *    at the end of a shift types 4,500 and moves on — and anomaly B, two gin
 *    bottles that left with no document, is confirmed rather than found. The
 *    variance is revealed after the count closes, which is when it is useful.
 *
 * 2. ONE ITEM PER SCREEN. Large targets, no scrolling, no mis-taps on the
 *    adjacent row. Someone is holding a phone in one hand and a torch in the
 *    other in a cold room.
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
import { formatMoney, formatQty } from '@/core/format';
import type { CloseCountResult, CountLine, CountListRow, CountType } from '@/core/types';

@Component({
    selector: 'app-counts',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputNumberModule, TagModule],
    template: `
        <div class="space-y-6">
            <div>
                <h1 class="text-2xl font-bold">Stock count</h1>
                <p class="text-surface-500 text-sm">{{ auth.location()?.name }}</p>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <!-- Counting -->
            @if (lines().length > 0 && !result()) {
                @if (current(); as line) {
                    <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-6 md:p-10">
                        <div class="flex items-center justify-between text-sm text-surface-500 mb-8">
                            <span>{{ index() + 1 }} of {{ lines().length }}</span>
                            <span class="font-mono">{{ line.code }}</span>
                        </div>

                        <div class="text-center mb-8">
                            <div class="text-2xl md:text-3xl font-bold mb-2">{{ line.name }}</div>
                            <div class="text-surface-500">How much is on the shelf, in {{ line.stockUnit }}?</div>
                        </div>

                        <div class="max-w-xs mx-auto mb-8">
                            <p-inputNumber
                                styleClass="w-full count-entry"
                                inputStyleClass="text-center text-3xl py-4"
                                [ngModel]="entry()"
                                (ngModelChange)="entry.set($event)"
                                [min]="0"
                                [maxFractionDigits]="3"
                                placeholder="0"></p-inputNumber>
                        </div>

                        <!-- No expected figure here, on purpose. See the note at
                             the top of this file: a visible expectation turns a
                             count into a confirmation. -->

                        <div class="flex items-center justify-between gap-3">
                            <button
                                pButton
                                outlined
                                icon="pi pi-chevron-left"
                                label="Back"
                                [disabled]="index() === 0"
                                (click)="prev()"></button>

                            <div class="text-xs text-surface-500">{{ countedSoFar() }} entered</div>

                            @if (index() < lines().length - 1) {
                                <button
                                    pButton
                                    icon="pi pi-chevron-right"
                                    iconPos="right"
                                    label="Next"
                                    [disabled]="entry() === null"
                                    (click)="next()"></button>
                            } @else {
                                <button
                                    pButton
                                    icon="pi pi-check"
                                    label="Finish"
                                    severity="success"
                                    [disabled]="entry() === null || busy()"
                                    (click)="finish()"></button>
                            }
                        </div>
                    </div>
                }
            }

            <!-- Result -->
            @if (result(); as res) {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-6 space-y-4">
                    <h2 class="text-xl font-bold">Count closed</h2>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="rounded-xl border border-surface p-4">
                            <div class="text-sm text-surface-500">Lines adjusted</div>
                            <div class="text-2xl font-bold">{{ res.adjustments }}</div>
                        </div>
                        <div class="rounded-xl border border-surface p-4">
                            <div class="text-sm text-surface-500">Variance value</div>
                            <div class="text-2xl font-bold" [class.text-red-600]="res.varianceValue < 0">
                                {{ money(res.varianceValue) }}
                            </div>
                        </div>
                    </div>

                    @if (res.biggest.length > 0) {
                        <div>
                            <div class="font-semibold mb-2">Biggest gaps</div>
                            <ul class="divide-y divide-surface">
                                @for (b of res.biggest; track b.name) {
                                    <li class="py-2 flex items-center justify-between">
                                        <span>{{ b.name }}</span>
                                        <span
                                            class="font-medium"
                                            [class.text-red-600]="b.varianceValue < 0"
                                            [class.text-green-600]="b.varianceValue > 0">
                                            {{ b.varianceQty > 0 ? '+' : '' }}{{ b.varianceQty }} ·
                                            {{ money(b.varianceValue) }}
                                        </span>
                                    </li>
                                }
                            </ul>
                            <p class="text-xs text-surface-500 mt-3">
                                A shortfall with no wastage document behind it is what the shrinkage
                                report looks for. Nothing here has been edited — the adjustment is a
                                new ledger entry.
                            </p>
                        </div>
                    } @else {
                        <p class="text-surface-500">Everything matched. No adjustments needed.</p>
                    }

                    <div class="flex justify-end">
                        <button pButton label="Done" (click)="reset()"></button>
                    </div>
                </div>
            }

            <!-- Start / history -->
            @if (lines().length === 0 && !result()) {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                    <h2 class="font-semibold">Start a count</h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Section</label>
                            <select
                                class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                [ngModel]="sectionId()"
                                (ngModelChange)="sectionId.set(+$event)">
                                @for (s of auth.sections(); track s.id) {
                                    <option [ngValue]="s.id">{{ s.name }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Type</label>
                            <select
                                class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                [ngModel]="countType()"
                                (ngModelChange)="countType.set($event)">
                                <option value="daily_critical">Daily — critical items</option>
                                <option value="weekly_full">Weekly — full</option>
                                <option value="monthly_full">Monthly — full</option>
                            </select>
                        </div>
                        <div class="flex items-end">
                            <button pButton class="w-full" label="Start counting" [disabled]="busy()" (click)="start()"></button>
                        </div>
                    </div>
                </div>

                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                    <div class="p-4 border-b border-surface font-semibold">Recent counts</div>
                    @if (history().length === 0) {
                        <p class="p-8 text-center text-surface-500">No counts yet.</p>
                    } @else {
                        <ul class="divide-y divide-surface">
                            @for (c of history(); track c.id) {
                                <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div class="font-medium">{{ label(c.countType) }} · {{ c.sectionCode }}</div>
                                        <div class="text-xs text-surface-500">
                                            {{ c.businessDate }} · {{ c.countedBy }}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        @if (!c.closed) {
                                            <button pButton size="small" label="Resume" (click)="resume(c.id)"></button>
                                        } @else if (c.verified) {
                                            <p-tag severity="success" value="Verified"></p-tag>
                                        } @else {
                                            <p-tag severity="warn" value="Closed"></p-tag>
                                            @if (canVerify()) {
                                                <button pButton size="small" label="Verify" (click)="verify(c.id)"></button>
                                            }
                                        }
                                    </div>
                                </li>
                            }
                        </ul>
                    }
                </div>
            }
        </div>
    `
})
export class CountsComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly history = signal<CountListRow[]>([]);
    readonly lines = signal<CountLine[]>([]);
    readonly index = signal(0);
    readonly entries = signal<Record<string, number>>({});
    readonly result = signal<CloseCountResult | null>(null);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);

    readonly sectionId = signal<number | null>(null);
    readonly countType = signal<CountType>('daily_critical');
    private countId: string | null = null;

    readonly current = computed(() => this.lines()[this.index()] ?? null);
    readonly countedSoFar = computed(() => Object.keys(this.entries()).length);
    readonly canVerify = computed(() => ['owner', 'manager'].includes(this.auth.role() ?? ''));

    readonly entry = signal<number | null>(null);

    async ngOnInit(): Promise<void> {
        this.sectionId.set(this.auth.storeSection()?.id ?? this.auth.sections()[0]?.id ?? null);
        await this.loadHistory();
    }

    private async loadHistory(): Promise<void> {
        try {
            this.history.set(await this.api.listCounts());
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }

    label(type: string): string {
        return (
            {
                daily_critical: 'Daily critical',
                weekly_full: 'Weekly full',
                monthly_full: 'Monthly full'
            }[type] ?? type
        );
    }

    async start(): Promise<void> {
        if (this.sectionId() === null) return;
        this.busy.set(true);
        this.error.set(null);
        try {
            const res = await this.api.openCount(this.sectionId()!, this.countType());
            this.countId = res.id;
            this.lines.set(res.lines);
            this.index.set(0);
            this.entries.set({});
            this.entry.set(null);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async resume(id: string): Promise<void> {
        this.busy.set(true);
        try {
            const detail = await this.api.getCount(id);
            this.countId = detail.id;
            this.lines.set(detail.lines);
            this.index.set(0);
            this.entries.set({});
            this.entry.set(null);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    private stash(): void {
        const line = this.current();
        if (!line || this.entry() === null) return;
        this.entries.update((e) => ({ ...e, [line.lineId]: this.entry()! }));
    }

    next(): void {
        this.stash();
        this.index.update((i) => Math.min(i + 1, this.lines().length - 1));
        this.entry.set(this.entries()[this.current()?.lineId ?? ''] ?? null);
    }

    prev(): void {
        this.stash();
        this.index.update((i) => Math.max(0, i - 1));
        this.entry.set(this.entries()[this.current()?.lineId ?? ''] ?? null);
    }

    async finish(): Promise<void> {
        this.stash();
        if (!this.countId) return;

        this.busy.set(true);
        this.error.set(null);
        try {
            const entered = this.entries();
            const payload = this.lines()
                .filter((l) => entered[l.lineId] !== undefined)
                .map((l) => ({ lineId: l.lineId, qtyCounted: entered[l.lineId]! }));

            await this.api.saveCountLines(this.countId, payload);
            const res = await this.api.closeCount(this.countId);
            this.result.set(res);
            this.lines.set([]);
            await this.loadHistory();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async verify(id: string): Promise<void> {
        try {
            await this.api.verifyCount(id);
            this.notify.success('Count verified');
            await this.loadHistory();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        }
    }

    reset(): void {
        this.result.set(null);
        this.countId = null;
        this.entries.set({});
        this.entry.set(null);
        void this.loadHistory();
    }

    money(n: number): string {
        return formatMoney(n);
    }

    qty(n: number, unit: string): string {
        return formatQty(n, unit);
    }
}
