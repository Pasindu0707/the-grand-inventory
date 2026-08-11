/**
 * Goods received note.
 *
 * Three rules from the build notes are load-bearing in this form:
 *
 *  - The user enters **packs**. "2 × 20 L can", never "40000". The stock-unit
 *    equivalent is shown read-only beside it so the storekeeper can sanity
 *    check the conversion, but it is never an input.
 *  - A price jump warns inline, before the lorry leaves, not in a report a
 *    fortnight later.
 *  - The Idempotency-Key is minted once when the form opens. Tapping Save twice
 *    on a stalled connection replays the first request instead of receiving the
 *    same delivery twice.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatMoney, formatQty } from '@/core/format';
import { uuid } from '@/core/uuid';
import type { Item, ItemPack, PriceWarning, Supplier } from '@/core/types';

interface Draft {
    itemId: number | null;
    packId: number | null;
    qtyPacks: number | null;
    packPrice: number | null;
}

@Component({
    selector: 'app-grn',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, InputNumberModule, TableModule],
    template: `
        <div class="space-y-6 max-w-5xl">
            <div>
                <h1 class="text-2xl font-bold">Receive delivery</h1>
                <p class="text-surface-500 text-sm">Goods received note</p>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Supplier</label>
                        <select
                            class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="supplierId()"
                            (ngModelChange)="supplierId.set(+$event)">
                            <option [ngValue]="null">Choose a supplier…</option>
                            @for (s of suppliers(); track s.id) {
                                <option [ngValue]="s.id">{{ s.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Invoice no.</label>
                        <input pInputText class="w-full" [ngModel]="invoiceNo()" (ngModelChange)="invoiceNo.set($event)" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Invoice date</label>
                        <input
                            type="date"
                            class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                            [ngModel]="invoiceDate()"
                            (ngModelChange)="invoiceDate.set($event)" />
                    </div>
                </div>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-6">
                <div class="flex items-center justify-between mb-3">
                    <span class="font-semibold">Items</span>
                    <button pButton size="small" icon="pi pi-plus" label="Add line" (click)="addLine()"></button>
                </div>

                <div class="space-y-3">
                    @for (line of lines(); track $index; let i = $index) {
                        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-surface pb-3">
                            <div class="md:col-span-4">
                                <label class="block text-xs text-surface-500 mb-1">Item</label>
                                <select
                                    class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                    [ngModel]="line.itemId"
                                    (ngModelChange)="setItem(i, +$event)">
                                    <option [ngValue]="null">Choose…</option>
                                    @for (it of items(); track it.id) {
                                        <option [ngValue]="it.id">{{ it.name }}</option>
                                    }
                                </select>
                            </div>

                            <div class="md:col-span-3">
                                <label class="block text-xs text-surface-500 mb-1">Pack</label>
                                <select
                                    class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                    [ngModel]="line.packId"
                                    (ngModelChange)="setPack(i, +$event)"
                                    [disabled]="!line.itemId">
                                    <option [ngValue]="null">Choose…</option>
                                    @for (p of packsFor(line.itemId); track p.id) {
                                        <option [ngValue]="p.id">{{ p.packName }}</option>
                                    }
                                </select>
                            </div>

                            <div class="md:col-span-2">
                                <label class="block text-xs text-surface-500 mb-1">Packs</label>
                                <p-inputNumber
                                    styleClass="w-full"
                                    [ngModel]="line.qtyPacks"
                                    (ngModelChange)="setQty(i, $event)"
                                    [min]="0"
                                    [maxFractionDigits]="3"></p-inputNumber>
                            </div>

                            <div class="md:col-span-2">
                                <label class="block text-xs text-surface-500 mb-1">Price / pack</label>
                                <p-inputNumber
                                    styleClass="w-full"
                                    [ngModel]="line.packPrice"
                                    (ngModelChange)="setPrice(i, $event)"
                                    [min]="0"
                                    [maxFractionDigits]="2"></p-inputNumber>
                            </div>

                            <div class="md:col-span-1 flex justify-end">
                                <button pButton text severity="danger" icon="pi pi-trash" (click)="removeLine(i)"></button>
                            </div>

                            <!-- Read-only conversion. Shown, never typed into. -->
                            <div class="md:col-span-12 text-xs text-surface-500 -mt-1">
                                @if (conversionFor(line); as conv) {
                                    <span>= {{ conv }}</span>
                                    <span class="mx-2">·</span>
                                }
                                <span>Line total {{ money(lineTotal(line)) }}</span>
                            </div>
                        </div>
                    }

                    @if (lines().length === 0) {
                        <p class="text-surface-500 text-sm py-4">No lines yet. Add what arrived.</p>
                    }
                </div>

                <div class="flex justify-end mt-4 text-lg font-semibold">Total {{ money(total()) }}</div>
            </div>

            @if (warnings().length > 0) {
                <div class="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4">
                    <div class="font-semibold text-amber-800 dark:text-amber-300 mb-2">Price changes on this delivery</div>
                    <ul class="text-sm space-y-1 text-amber-900 dark:text-amber-200">
                        @for (w of warnings(); track w.itemPackId) {
                            <li>
                                {{ w.itemName }} ({{ w.packName }}): {{ money(w.previousPrice) }} →
                                {{ money(w.newPrice) }}
                                <strong>({{ w.changePct > 0 ? '+' : '' }}{{ w.changePct }}%)</strong>
                            </li>
                        }
                    </ul>
                </div>
            }

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            <div class="flex justify-end gap-3">
                <button pButton outlined label="Cancel" (click)="cancel()"></button>
                <button
                    pButton
                    label="Save delivery"
                    icon="pi pi-check"
                    [disabled]="!canSubmit() || saving()"
                    [loading]="saving()"
                    (click)="submit()"></button>
            </div>
        </div>
    `
})
export class GrnComponent implements OnInit {
    private api = inject(GrandService);
    private notify = inject(NotifyService);
    private router = inject(Router);

    readonly items = signal<Item[]>([]);
    readonly suppliers = signal<Supplier[]>([]);
    readonly lines = signal<Draft[]>([]);
    readonly supplierId = signal<number | null>(null);
    readonly invoiceNo = signal('');
    readonly invoiceDate = signal('');
    readonly saving = signal(false);
    readonly error = signal<string | null>(null);
    readonly warnings = signal<PriceWarning[]>([]);

    /**
     * Minted once, per form. Not per submit — that would defeat the purpose.
     */
    private idempotencyKey = uuid();

    readonly total = computed(() =>
        this.lines().reduce((sum, l) => sum + this.lineTotal(l), 0)
    );

    readonly canSubmit = computed(
        () =>
            this.supplierId() !== null &&
            this.lines().length > 0 &&
            this.lines().every(
                (l) => l.packId !== null && (l.qtyPacks ?? 0) > 0 && (l.packPrice ?? 0) >= 0
            )
    );

    async ngOnInit(): Promise<void> {
        try {
            const [items, suppliers] = await Promise.all([this.api.listItems(), this.api.listSuppliers()]);
            this.items.set(items);
            this.suppliers.set(suppliers);
            this.addLine();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
    }

    addLine(): void {
        this.lines.update((ls) => [...ls, { itemId: null, packId: null, qtyPacks: null, packPrice: null }]);
    }

    removeLine(index: number): void {
        this.lines.update((ls) => ls.filter((_, i) => i !== index));
    }

    private patch(index: number, patch: Partial<Draft>): void {
        this.lines.update((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    }

    setItem(index: number, itemId: number): void {
        const item = this.items().find((i) => i.id === itemId);
        const defaultPack = item?.packs.find((p) => p.isDefaultPurchase) ?? item?.packs[0];
        this.patch(index, { itemId, packId: defaultPack?.id ?? null });
    }

    setPack(index: number, packId: number): void {
        this.patch(index, { packId });
    }

    setQty(index: number, qtyPacks: number | null): void {
        this.patch(index, { qtyPacks });
    }

    setPrice(index: number, packPrice: number | null): void {
        this.patch(index, { packPrice });
    }

    packsFor(itemId: number | null): ItemPack[] {
        if (itemId === null) return [];
        return this.items().find((i) => i.id === itemId)?.packs ?? [];
    }

    /** "= 40 L" — the conversion made visible so a wrong pack is obvious. */
    conversionFor(line: Draft): string | null {
        if (line.itemId === null || line.packId === null || !line.qtyPacks) return null;
        const item = this.items().find((i) => i.id === line.itemId);
        const pack = item?.packs.find((p) => p.id === line.packId);
        if (!item || !pack) return null;
        return formatQty(line.qtyPacks * pack.qtyInStockUnit, item.stockUnit);
    }

    lineTotal(line: Draft): number {
        return (line.qtyPacks ?? 0) * (line.packPrice ?? 0);
    }

    money(n: number): string {
        return formatMoney(n);
    }

    cancel(): void {
        void this.router.navigate(['/today']);
    }

    async submit(): Promise<void> {
        if (!this.canSubmit()) return;

        this.saving.set(true);
        this.error.set(null);
        try {
            const result = await this.api.createGrn(
                {
                    supplierId: this.supplierId()!,
                    invoiceNo: this.invoiceNo() || null,
                    invoiceDate: this.invoiceDate() || null,
                    lines: this.lines().map((l) => ({
                        itemPackId: l.packId!,
                        qtyPacks: l.qtyPacks!,
                        packPrice: l.packPrice!
                    }))
                },
                this.idempotencyKey
            );

            this.warnings.set(result.priceWarnings);

            if (result.priceWarnings.length > 0) {
                // Recorded, not blocked. The delivery is already in the store;
                // refusing it would only mean the stock figure is wrong instead.
                this.notify.warning(
                    `${result.priceWarnings.length} price change(s) on this delivery — worth a look.`
                );
            } else {
                this.notify.success(`Delivery recorded. ${this.money(result.total)}`);
                await this.router.navigate(['/stock']);
            }

            // A new document needs a new key.
            this.idempotencyKey = uuid();
            if (result.priceWarnings.length === 0) this.resetForm();
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.saving.set(false);
        }
    }

    private resetForm(): void {
        this.lines.set([]);
        this.invoiceNo.set('');
        this.invoiceDate.set('');
        this.addLine();
    }
}
