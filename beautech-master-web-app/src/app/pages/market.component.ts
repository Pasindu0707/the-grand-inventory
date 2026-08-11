/**
 * Cash market purchase — the fish market at 05:30, the vegetable pola.
 *
 * No invoice exists, so the photo of the handwritten slip is the only evidence
 * that the money bought anything. Save stays disabled until there is one. The
 * server enforces it too; this is the half the buyer actually sees.
 *
 * Quantities are in stock units here, unlike a GRN. There is no pack at a
 * market stall — you buy 3.2 kg of prawns for Rs 6,400 — so the form asks for
 * the natural unit and the total paid, and lets the server derive unit cost.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatMoney } from '@/core/format';
import { uuid } from '@/core/uuid';
import type { Item, MarketListRow, Supplier } from '@/core/types';

interface Draft {
    itemId: number | null;
    qty: number | null;
    price: number | null;
}

@Component({
    selector: 'app-market',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputNumberModule],
    template: `
        <div class="space-y-6 max-w-5xl">
            <div>
                <h1 class="text-2xl font-bold">Market purchase</h1>
                <p class="text-surface-500 text-sm">Cash buy, no invoice</p>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <!-- Photo first. It is the point of the document. -->
            <!-- ngClass rather than [class.x]: Tailwind variants contain ':'
                 and '/', which are not valid in a [class.name] binding. -->
            <div
                class="rounded-2xl border-2 border-dashed p-4 md:p-6"
                [ngClass]="
                    photoUrl()
                        ? 'border-surface'
                        : 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                ">
                <div class="flex flex-wrap items-center gap-4">
                    @if (photoUrl(); as url) {
                        <img [src]="url" alt="Slip" class="h-24 w-24 object-cover rounded-lg border border-surface" />
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-green-700">Slip photographed</div>
                            <div class="text-xs text-surface-500 truncate">{{ url }}</div>
                        </div>
                        <button pButton outlined size="small" label="Replace" (click)="picker.click()"></button>
                    } @else {
                        <div class="flex-1">
                            <div class="font-semibold text-amber-800 dark:text-amber-300">
                                Photograph the slip
                            </div>
                            <div class="text-sm text-amber-700 dark:text-amber-400">
                                A cash buy has no invoice. This photo is the only record that the
                                money bought anything, so it is required.
                            </div>
                        </div>
                        <button
                            pButton
                            icon="pi pi-camera"
                            label="Take photo"
                            [loading]="uploading()"
                            (click)="picker.click()"></button>
                    }
                </div>

                <input
                    #picker
                    type="file"
                    accept="image/*"
                    capture="environment"
                    class="hidden"
                    (change)="onPhoto($event)" />
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Where from</label>
                        <select
                            class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="supplierId()"
                            (ngModelChange)="supplierId.set($event === null ? null : +$event)">
                            <option [ngValue]="null">Not recorded</option>
                            @for (s of cashSuppliers(); track s.id) {
                                <option [ngValue]="s.id">{{ s.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Cash taken</label>
                        <p-inputNumber
                            styleClass="w-full"
                            [ngModel]="cashGiven()"
                            (ngModelChange)="cashGiven.set($event)"
                            [min]="0"
                            [maxFractionDigits]="2"></p-inputNumber>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Cash returned</label>
                        <p-inputNumber
                            styleClass="w-full"
                            [ngModel]="cashReturned()"
                            (ngModelChange)="cashReturned.set($event)"
                            [min]="0"
                            [maxFractionDigits]="2"></p-inputNumber>
                    </div>
                </div>

                @if (cashGap() !== null) {
                    <div class="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200">
                        Cash spent and lines do not agree by {{ money(cashGap()!) }}. It will still be
                        recorded — market prices get rounded — but check the slip.
                    </div>
                }
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6">
                <div class="flex items-center justify-between mb-3">
                    <span class="font-semibold">What was bought</span>
                    <button pButton size="small" icon="pi pi-plus" label="Add line" (click)="addLine()"></button>
                </div>

                <div class="space-y-3">
                    @for (line of lines(); track $index; let i = $index) {
                        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-surface pb-3">
                            <div class="md:col-span-6">
                                <label class="block text-xs text-surface-500 mb-1">Item</label>
                                <select
                                    class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                    [ngModel]="line.itemId"
                                    (ngModelChange)="patch(i, { itemId: +$event })">
                                    <option [ngValue]="null">Choose…</option>
                                    @for (it of items(); track it.id) {
                                        <option [ngValue]="it.id">{{ it.name }}</option>
                                    }
                                </select>
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-xs text-surface-500 mb-1">
                                    Quantity {{ unitFor(line.itemId) }}
                                </label>
                                <p-inputNumber
                                    styleClass="w-full"
                                    [ngModel]="line.qty"
                                    (ngModelChange)="patch(i, { qty: $event })"
                                    [min]="0"
                                    [maxFractionDigits]="3"></p-inputNumber>
                            </div>
                            <div class="md:col-span-3">
                                <label class="block text-xs text-surface-500 mb-1">Total paid</label>
                                <p-inputNumber
                                    styleClass="w-full"
                                    [ngModel]="line.price"
                                    (ngModelChange)="patch(i, { price: $event })"
                                    [min]="0"
                                    [maxFractionDigits]="2"></p-inputNumber>
                            </div>
                            <div class="md:col-span-1 flex justify-end">
                                <button pButton text severity="danger" icon="pi pi-trash" (click)="removeLine(i)"></button>
                            </div>
                        </div>
                    }
                    @if (lines().length === 0) {
                        <p class="text-surface-500 text-sm py-4">Nothing added yet.</p>
                    }
                </div>

                <div class="flex justify-end mt-4 text-lg font-semibold">Total {{ money(total()) }}</div>
            </div>

            <div class="flex justify-end gap-3">
                <button
                    pButton
                    label="Record purchase"
                    icon="pi pi-check"
                    [disabled]="!canSubmit() || saving()"
                    [loading]="saving()"
                    (click)="submit()"></button>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                <div class="p-4 border-b border-surface font-semibold">Recent cash buys</div>
                @if (recent().length === 0) {
                    <p class="p-8 text-center text-surface-500">None yet.</p>
                } @else {
                    <ul class="divide-y divide-surface">
                        @for (m of recent(); track m.id) {
                            <li class="p-4 flex items-center justify-between gap-3">
                                <div class="flex items-center gap-3 min-w-0">
                                    @if (m.photoUrl) {
                                        <img [src]="m.photoUrl" alt="slip" class="h-10 w-10 rounded object-cover border border-surface" />
                                    }
                                    <div class="min-w-0">
                                        <div class="font-medium truncate">{{ m.supplierName || 'Market' }}</div>
                                        <div class="text-xs text-surface-500">
                                            {{ m.boughtBy }} · {{ m.lineCount }} line(s)
                                        </div>
                                    </div>
                                </div>
                                <div class="text-right shrink-0">
                                    <div class="font-medium">{{ money(m.total) }}</div>
                                    <div class="text-xs text-surface-500">{{ when(m.boughtAt) }}</div>
                                </div>
                            </li>
                        }
                    </ul>
                }
            </div>
        </div>
    `
})
export class MarketComponent implements OnInit {
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly items = signal<Item[]>([]);
    readonly suppliers = signal<Supplier[]>([]);
    readonly recent = signal<MarketListRow[]>([]);
    readonly lines = signal<Draft[]>([]);
    readonly supplierId = signal<number | null>(null);
    readonly cashGiven = signal<number | null>(null);
    readonly cashReturned = signal<number | null>(null);
    readonly photoUrl = signal<string | null>(null);
    readonly uploading = signal(false);
    readonly saving = signal(false);
    readonly error = signal<string | null>(null);

    private idempotencyKey = uuid();

    readonly cashSuppliers = computed(() => this.suppliers().filter((s) => s.isCashMarket));

    readonly total = computed(() =>
        this.lines().reduce((sum, l) => sum + (l.price ?? 0), 0)
    );

    readonly cashGap = computed(() => {
        const given = this.cashGiven();
        if (given === null || this.lines().length === 0) return null;
        const spent = given - (this.cashReturned() ?? 0);
        const gap = Math.round((spent - this.total()) * 100) / 100;
        return Math.abs(gap) >= 1 ? gap : null;
    });

    readonly canSubmit = computed(
        () =>
            // The photo gate. Without it there is no document worth having.
            !!this.photoUrl() &&
            this.lines().length > 0 &&
            this.lines().every((l) => l.itemId !== null && (l.qty ?? 0) > 0 && (l.price ?? 0) >= 0)
    );

    async ngOnInit(): Promise<void> {
        try {
            const [items, suppliers, recent] = await Promise.all([
                this.api.listItems(),
                this.api.listSuppliers(),
                this.api.listMarket(10)
            ]);
            this.items.set(items);
            this.suppliers.set(suppliers);
            this.recent.set(recent);
            this.addLine();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }

    async onPhoto(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.uploading.set(true);
        this.error.set(null);
        try {
            const res = await this.api.uploadPhoto(file);
            this.photoUrl.set(res.url);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.uploading.set(false);
            input.value = '';
        }
    }

    addLine(): void {
        this.lines.update((ls) => [...ls, { itemId: null, qty: null, price: null }]);
    }

    removeLine(i: number): void {
        this.lines.update((ls) => ls.filter((_, idx) => idx !== i));
    }

    patch(i: number, patch: Partial<Draft>): void {
        this.lines.update((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    }

    unitFor(itemId: number | null): string {
        if (itemId === null) return '';
        const item = this.items().find((i) => i.id === itemId);
        return item ? `(${item.stockUnit})` : '';
    }

    money(n: number): string {
        return formatMoney(n);
    }

    when(iso: string): string {
        return new Date(iso).toLocaleString('en-LK', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async submit(): Promise<void> {
        if (!this.canSubmit()) return;
        this.saving.set(true);
        this.error.set(null);
        try {
            const result = await this.api.createMarketPurchase(
                {
                    supplierId: this.supplierId(),
                    photoUrl: this.photoUrl()!,
                    cashGiven: this.cashGiven(),
                    cashReturned: this.cashReturned(),
                    lines: this.lines().map((l) => ({
                        itemId: l.itemId!,
                        qtyBase: l.qty!,
                        totalPrice: l.price!
                    }))
                },
                this.idempotencyKey
            );

            if (result.cashDiscrepancy !== null) {
                this.notify.warning(
                    `Recorded, but the cash is out by ${this.money(result.cashDiscrepancy)}.`
                );
            } else {
                this.notify.success(`Recorded. ${this.money(result.total)}`);
            }

            this.idempotencyKey = uuid();
            this.lines.set([]);
            this.photoUrl.set(null);
            this.cashGiven.set(null);
            this.cashReturned.set(null);
            this.addLine();
            this.recent.set(await this.api.listMarket(10));
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.saving.set(false);
        }
    }
}
