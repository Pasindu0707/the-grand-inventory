/**
 * Ask for stock.
 *
 * The screen a cleaner or a cook uses, so it asks three things and nothing
 * more: what, how much, and when you need it. No section picker — it is
 * theirs. No units to choose — the item decides.
 *
 * If the store is short, it says so before you send, and offers to turn the
 * shortfall into a purchase request in the same breath. Finding out two days
 * later that there was never any lettuce is the thing that makes people stop
 * using a system and start shouting down a corridor instead.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import type { Item, Shortage } from '@/core/types';

interface Line {
    itemId: number | null;
    qty: number | null;
}

@Component({
    selector: 'app-ask',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputNumberModule, InputTextModule],
    template: `
        <div class="space-y-6 max-w-3xl">
            <div>
                <h1 class="text-2xl font-bold">Ask for stock</h1>
                <p class="text-surface-500 text-sm">
                    The store will see this and hand it over
                </p>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                @for (line of lines(); track $index; let i = $index) {
                    <div class="flex flex-wrap items-end gap-3 pb-3 border-b border-surface last:border-0">
                        <div class="flex-1 min-w-[200px]">
                            <label class="block text-sm font-medium mb-1">What do you need?</label>
                            <select
                                class="w-full px-3 py-3 text-base rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                [ngModel]="line.itemId"
                                (ngModelChange)="setItem(i, +$event)">
                                <option [ngValue]="null">Choose an item…</option>
                                @for (it of items(); track it.id) {
                                    <option [ngValue]="it.id">{{ it.name }}</option>
                                }
                            </select>
                        </div>

                        <div class="w-40">
                            <label class="block text-sm font-medium mb-1">
                                How much? <span class="text-surface-500">{{ unitFor(line.itemId) }}</span>
                            </label>
                            <p-inputNumber
                                styleClass="w-full"
                                inputStyleClass="py-3 text-base"
                                [ngModel]="line.qty"
                                (ngModelChange)="setQty(i, $event)"
                                [min]="0"
                                [maxFractionDigits]="3"></p-inputNumber>
                        </div>

                        @if (lines().length > 1) {
                            <button pButton text severity="danger" icon="pi pi-trash" (click)="removeLine(i)"></button>
                        }
                    </div>
                }

                <button pButton outlined icon="pi pi-plus" label="Add another item" (click)="addLine()"></button>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1">When do you need it?</label>
                    <input
                        type="date"
                        class="w-full md:w-64 px-3 py-3 text-base rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                        [ngModel]="neededBy()"
                        (ngModelChange)="neededBy.set($event)" />
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Anything to add? (optional)</label>
                    <input
                        pInputText
                        class="w-full"
                        placeholder="e.g. for Saturday function"
                        [ngModel]="note()"
                        (ngModelChange)="note.set($event)" />
                </div>
            </div>

            @if (shortages().length > 0) {
                <div class="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
                    <div class="font-semibold text-amber-900 dark:text-amber-200">
                        The store does not have enough
                    </div>
                    <ul class="text-sm space-y-1 text-amber-900 dark:text-amber-200">
                        @for (s of shortages(); track s.itemId) {
                            <li>
                                <strong>{{ s.name }}</strong> — you asked for
                                {{ q(s.requested, s.stockUnit) }}, the store has
                                {{ q(s.inStore, s.stockUnit) }}.
                                Short by {{ q(s.short, s.stockUnit) }}.
                            </li>
                        }
                    </ul>
                    <p class="text-sm text-amber-800 dark:text-amber-300">
                        You can still send the request — the store will give you what they have.
                        Ask management to buy the rest as well?
                    </p>
                    <div class="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="raisePo"
                            class="w-5 h-5"
                            [checked]="raisePo()"
                            (change)="raisePo.set(!raisePo())" />
                        <label for="raisePo" class="text-sm font-medium">
                            Yes, ask management to buy the shortfall
                        </label>
                    </div>
                </div>
            }

            <div class="flex flex-wrap justify-end gap-3">
                <button pButton outlined label="Check the store" [disabled]="!canSubmit() || busy()" (click)="check()"></button>
                <button
                    pButton
                    label="Send request"
                    icon="pi pi-send"
                    size="large"
                    [disabled]="!canSubmit() || busy()"
                    [loading]="busy()"
                    (click)="submit()"></button>
            </div>
        </div>
    `
})
export class AskComponent implements OnInit {
    private api = inject(GrandService);
    private notify = inject(NotifyService);
    private router = inject(Router);

    readonly items = signal<Item[]>([]);
    readonly lines = signal<Line[]>([{ itemId: null, qty: null }]);
    readonly neededBy = signal(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
    readonly note = signal('');
    readonly shortages = signal<Shortage[]>([]);
    readonly raisePo = signal(true);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);

    readonly canSubmit = computed(() =>
        this.lines().some((l) => l.itemId !== null && (l.qty ?? 0) > 0)
    );

    async ngOnInit(): Promise<void> {
        try {
            this.items.set(await this.api.listItems());
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }

    addLine(): void {
        this.lines.update((ls) => [...ls, { itemId: null, qty: null }]);
    }

    removeLine(i: number): void {
        this.lines.update((ls) => ls.filter((_, idx) => idx !== i));
    }

    setItem(i: number, itemId: number): void {
        this.lines.update((ls) => ls.map((l, idx) => (idx === i ? { ...l, itemId } : l)));
        this.shortages.set([]);
    }

    setQty(i: number, qty: number | null): void {
        this.lines.update((ls) => ls.map((l, idx) => (idx === i ? { ...l, qty } : l)));
        this.shortages.set([]);
    }

    unitFor(itemId: number | null): string {
        if (itemId === null) return '';
        const item = this.items().find((i) => i.id === itemId);
        return item ? `(${item.stockUnit})` : '';
    }

    q(qty: number, unit: string): string {
        return formatQty(qty, unit);
    }

    private payloadLines() {
        return this.lines()
            .filter((l) => l.itemId !== null && (l.qty ?? 0) > 0)
            .map((l) => ({ itemId: l.itemId!, qtyRequested: l.qty! }));
    }

    async check(): Promise<void> {
        this.busy.set(true);
        try {
            const res = await this.api.checkStore(this.payloadLines());
            this.shortages.set(res.shortages);
            if (res.shortages.length === 0) {
                this.notify.success('The store has everything you asked for');
            }
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async submit(): Promise<void> {
        if (!this.canSubmit()) return;
        this.busy.set(true);
        this.error.set(null);

        try {
            const lines = this.payloadLines();
            const result = await this.api.ask({
                neededBy: this.neededBy() || null,
                note: this.note() || null,
                lines
            });

            // Raise the purchase request in the same action, so the person does
            // not have to know that "the store is short" and "somebody must buy
            // some" are two different screens.
            if (result.shortages.length > 0 && this.raisePo()) {
                await this.api.raisePurchaseOrder({
                    issueId: result.id,
                    neededBy: this.neededBy() || null,
                    reason: this.note() || 'Store did not have enough',
                    lines: result.shortages.map((s) => ({ itemId: s.itemId, qtyBase: s.short }))
                });
                this.notify.success('Request sent, and management asked to buy the rest');
            } else {
                this.notify.success('Request sent to the store');
            }

            await this.router.navigate(['/requests']);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }
}
