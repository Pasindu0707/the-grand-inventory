/**
 * Wastage.
 *
 * The reason code is the whole point. "Stock went down" is useless; "180 g of
 * lettuce spoiled" is what separates honest waste from shrinkage when the
 * reports run. So the reason is required and picked from a list, never typed.
 *
 * Logging writes the ledger immediately — the food is already in the bin.
 * Approval is a manager reviewing something that happened, not a gate the
 * stock figure waits behind.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import type { Item, ReasonCode, WastageRow } from '@/core/types';

@Component({
    selector: 'app-wastage',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputNumberModule, InputTextModule, TagModule],
    template: `
        <div class="space-y-6">
            <div>
                <h1 class="text-2xl font-bold">Wastage</h1>
                <p class="text-surface-500 text-sm">Spoilage, breakage and everything else that did not get sold</p>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                <h2 class="font-semibold">Log wastage</h2>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                        <label class="block text-sm font-medium mb-1">Item</label>
                        <select
                            class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="itemId()"
                            (ngModelChange)="itemId.set(+$event)">
                            <option [ngValue]="null">Choose…</option>
                            @for (it of items(); track it.id) {
                                <option [ngValue]="it.id">{{ it.name }}</option>
                            }
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium mb-1">Quantity {{ unit() }}</label>
                        <p-inputNumber
                            styleClass="w-full"
                            [ngModel]="qty()"
                            (ngModelChange)="qty.set($event)"
                            [min]="0"
                            [maxFractionDigits]="3"></p-inputNumber>
                    </div>

                    <div>
                        <label class="block text-sm font-medium mb-1">Reason</label>
                        <select
                            class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="reasonCode()"
                            (ngModelChange)="reasonCode.set($event)">
                            <option [ngValue]="null">Choose…</option>
                            @for (r of reasons(); track r.code) {
                                <option [ngValue]="r.code">{{ r.label }}</option>
                            }
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">Note (optional)</label>
                    <input pInputText class="w-full" [ngModel]="note()" (ngModelChange)="note.set($event)" />
                </div>

                <div class="flex justify-end">
                    <button
                        pButton
                        label="Log wastage"
                        icon="pi pi-trash"
                        severity="danger"
                        [disabled]="!canSubmit() || busy()"
                        (click)="submit()"></button>
                </div>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                <div class="p-4 flex items-center justify-between border-b border-surface">
                    <span class="font-semibold">Recent</span>
                    <button
                        pButton
                        size="small"
                        [outlined]="!pendingOnly()"
                        label="Awaiting approval"
                        (click)="togglePending()"></button>
                </div>

                @if (rows().length === 0) {
                    <p class="p-8 text-center text-surface-500">{{ loading() ? 'Loading…' : 'Nothing logged.' }}</p>
                } @else {
                    <ul class="divide-y divide-surface">
                        @for (row of rows(); track row.id) {
                            <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="font-medium">
                                        {{ row.itemName }} · {{ q(row.qtyBase, row.stockUnit) }}
                                    </div>
                                    <div class="text-xs text-surface-500">
                                        {{ row.sectionCode }} · {{ row.loggedBy }} · {{ when(row.loggedAt) }}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <p-tag severity="info" [value]="row.reasonLabel"></p-tag>
                                    @if (row.approved) {
                                        <p-tag severity="success" value="Approved"></p-tag>
                                    } @else if (canApprove()) {
                                        <button pButton size="small" label="Approve" (click)="approve(row.id)"></button>
                                    } @else {
                                        <p-tag severity="warn" value="Pending"></p-tag>
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
export class WastageComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly rows = signal<WastageRow[]>([]);
    readonly items = signal<Item[]>([]);
    readonly reasons = signal<ReasonCode[]>([]);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);
    readonly pendingOnly = signal(false);

    readonly sectionId = signal<number | null>(null);
    readonly itemId = signal<number | null>(null);
    readonly qty = signal<number | null>(null);
    readonly reasonCode = signal<string | null>(null);
    readonly note = signal('');

    readonly canApprove = computed(() => ['owner', 'manager'].includes(this.auth.role() ?? ''));

    readonly unit = computed(() => {
        const item = this.items().find((i) => i.id === this.itemId());
        return item ? `(${item.stockUnit})` : '';
    });

    readonly canSubmit = computed(
        () =>
            this.sectionId() !== null &&
            this.itemId() !== null &&
            (this.qty() ?? 0) > 0 &&
            !!this.reasonCode()
    );

    async ngOnInit(): Promise<void> {
        this.sectionId.set(this.auth.sections()[0]?.id ?? null);
        try {
            const [items, reasons] = await Promise.all([
                this.api.listItems(),
                this.api.reasonCodes('wastage')
            ]);
            this.items.set(items);
            this.reasons.set(reasons);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
        await this.load();
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            this.rows.set(await this.api.listWastage(this.pendingOnly()));
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    togglePending(): void {
        this.pendingOnly.update((v) => !v);
        void this.load();
    }

    async submit(): Promise<void> {
        if (!this.canSubmit()) return;
        this.busy.set(true);
        try {
            await this.api.logWastage({
                sectionId: this.sectionId()!,
                itemId: this.itemId()!,
                qtyBase: this.qty()!,
                reasonCode: this.reasonCode()!,
                note: this.note() || null
            });
            this.notify.success('Wastage logged');
            this.itemId.set(null);
            this.qty.set(null);
            this.reasonCode.set(null);
            this.note.set('');
            await this.load();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async approve(id: string): Promise<void> {
        try {
            await this.api.approveWastage(id);
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
