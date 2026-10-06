/**
 * Receive delivery - tick off what came off the lorry.
 *
 * The screen opens on what is expected: every approved order, grouped by
 * supplier, because that is how a morning of deliveries arrives - "three
 * deliveries, two suppliers". Pick the one at the door and it becomes a
 * checklist of what is still to come on it. Tick what is there; a tick fills in
 * the outstanding amount, which can be changed when only part of it came.
 * Anything not ticked stays open on the order until it turns up, or until
 * management voids it with a reason.
 *
 * Two rules from the build notes still hold:
 *
 *  - Quantities are **packs** - "2 × 20 L can", never "40000". The stock-unit
 *    figure is shown beside it so a wrong pack is obvious, but never typed.
 *  - The Idempotency-Key is minted once per delivery. Tapping Save twice on a
 *    stalled connection replays the first request instead of receiving the
 *    same goods twice.
 *
 * After saving, the delivery is read back from the server - what came, and
 * what is still outstanding on the order - with a button to print it.
 *
 * Something that arrives with no order behind it is still received here, as a
 * checklist with nothing on it and a supplier to choose.
 *
 * **More than is owed is allowed, but said out loud.** A line where more came
 * off the lorry than the order still owes - or an item added that the order
 * does not still ask for - is received (it is physically here), warned about
 * on the spot, and sends the delivery to management. That is where a box
 * already settled by a credit note, sent again, gets caught.
 *
 * **Bad goods go back on the same lorry.** A ticked line can say "some are
 * bad": how many, why, and whether the supplier owes a replacement or a credit
 * note. Those packs never enter stock. A delivery with anything sent back, or
 * with something still to come, goes to management as a delivery report.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import { openPrint } from '@/core/print';
import { uuid } from '@/core/uuid';
import type {
    GrnDetail,
    Item,
    ItemPack,
    PurchaseOrder,
    PurchaseOrderLine,
    ReasonCode,
    RejectionOutcome,
    Supplier
} from '@/core/types';
import { AppItemPicker } from '@/shared/item-picker.component';

/** One line of the order, as a box to tick. */
interface CheckRow {
    lineId: string;
    /** Null for a product ordered by name, which is not stock. */
    itemId: number | null;
    name: string;
    code: string | null;
    /** Stock unit for an item; what a named product is counted in. */
    unit: string | null;
    /** The pack it was ordered in. Null for a named product. */
    packId: number | null;
    packName: string | null;
    packSize: number | null;
    /** Still to come, in packs (or plain count for a named product). */
    outstanding: number;
    ticked: boolean;
    /** How many came off the lorry, good and bad together. */
    qty: number | null;
    expiry: string;
    /** Some of it is going straight back. */
    bad: boolean;
    badQty: number | null;
    badReason: string;
    badNote: string;
    badOutcome: RejectionOutcome;
}

/** Something that came and is not on the order. */
interface ExtraRow {
    key: string;
    itemId: number | null;
    packId: number | null;
    qty: number | null;
    expiry: string;
}

/** A supplier's expected deliveries, for the list. */
interface SupplierGroup {
    supplierId: number | null;
    supplierName: string;
    orders: PurchaseOrder[];
}

@Component({
    selector: 'app-grn',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        TagModule,
        RouterLink,
        AppItemPicker
    ],
    template: `
        <div class="space-y-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Receive delivery</h1>
                    <p class="text-surface-500 text-sm">
                        @if (mode() === 'list') {
                            Pick the delivery at the door and tick off what came.
                        } @else if (mode() === 'check') {
                            Tick what is here. Anything not ticked stays open on the order.
                        } @else {
                            Saved. Print it for the file.
                        }
                    </p>
                </div>
                @if (mode() === 'check') {
                    <button
                        pButton
                        text
                        icon="pi pi-arrow-left"
                        label="All deliveries"
                        (click)="backToList()"></button>
                }
            </div>

            @if (error()) {
                <div class="app-note app-note--error">
                    <div class="app-note__title">That did not save</div>
                    <p class="mt-1">{{ error() }}</p>
                    @if (mode() === 'check') {
                        <p class="mt-1">
                            <strong>Nothing was recorded.</strong> Your ticks are still here - fix
                            what the message says and press Save again.
                        </p>
                    }
                </div>
            }

            <!-- ── Expected deliveries ─────────────────────────────────────── -->
            @if (mode() === 'list') {
                <div
                    class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        @if (loadingOrders()) {
                            <span class="text-surface-500">Loading…</span>
                        } @else {
                            <div class="text-lg font-semibold">
                                {{ expected().length }}
                                {{ expected().length === 1 ? 'delivery' : 'deliveries' }} expected
                            </div>
                            <div class="text-sm text-surface-500">
                                from {{ groups().length }}
                                {{ groups().length === 1 ? 'supplier' : 'suppliers' }} · tap
                                <strong>Receive</strong> when the lorry is at the door
                            </div>
                        }
                    </div>
                    <div class="flex flex-wrap gap-2">
                        @if (expected().length > 0) {
                            <button
                                pButton
                                outlined
                                icon="pi pi-print"
                                label="Print all checklists"
                                (click)="printChecklist()"></button>
                        }
                        <button
                            pButton
                            text
                            icon="pi pi-pencil"
                            label="Something came that was not ordered"
                            (click)="startManual()"></button>
                    </div>
                </div>

                @if (!loadingOrders() && expected().length === 0) {
                    <div
                        class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-8 text-center text-surface-500">
                        Nothing is on order right now.
                    </div>
                }

                @for (group of groups(); track group.supplierName) {
                    <div
                        class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                        <div
                            class="px-5 py-3 border-b border-surface bg-surface-50 dark:bg-surface-800 flex flex-wrap items-center justify-between gap-2">
                            <div class="min-w-0">
                                <div class="font-semibold">{{ group.supplierName }}</div>
                                <div class="text-xs text-surface-500">
                                    {{ group.orders.length }}
                                    {{ group.orders.length === 1 ? 'delivery' : 'deliveries' }} expected
                                    @if (phoneOf(group.supplierId); as phone) {
                                        · {{ phone }}
                                    }
                                </div>
                            </div>
                            <button
                                pButton
                                size="small"
                                text
                                icon="pi pi-print"
                                label="Print checklist"
                                [attr.aria-label]="'Print the delivery checklist for ' + group.supplierName"
                                (click)="printChecklist({ supplier: group.supplierId })"></button>
                        </div>
                        <ul class="divide-y divide-surface">
                            @for (order of group.orders; track order.id) {
                                <li
                                    class="px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer"
                                    (click)="open(order)">
                                        <div class="min-w-0">
                                            <div class="font-medium">
                                                Order no. <span class="font-mono">{{ order.id }}</span>
                                                <span class="text-surface-500 font-normal">
                                                    · {{ outstandingCount(order) }} of
                                                    {{ order.lines.length }} still to come
                                                </span>
                                            </div>
                                            <div class="text-sm text-surface-500 mt-0.5">
                                                {{ orderSummary(order) }}
                                            </div>
                                            <div class="text-xs text-surface-500 mt-0.5">
                                                raised {{ day(order.raisedAt) }} by {{ order.raisedBy }}
                                                @if (order.neededBy) {
                                                    · needed by {{ order.neededBy }}
                                                }
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2 shrink-0">
                                            @if (order.partReceived) {
                                                <p-tag severity="warn" value="Part delivered"></p-tag>
                                            }
                                            <button
                                                pButton
                                                icon="pi pi-truck"
                                                label="Receive"
                                                [attr.aria-label]="'Receive order ' + order.id + ' from ' + order.supplierName"
                                                (click)="open(order); $event.stopPropagation()"></button>
                                        </div>
                                </li>
                            }
                        </ul>
                    </div>
                }

                @if (waiting().length > 0) {
                    <!-- Shown so "where is my order" has an answer, but inert:
                         the server will not book a delivery against an order
                         nobody has approved. -->
                    <div class="rounded-2xl border border-surface overflow-hidden opacity-70">
                        <div class="px-5 py-3 border-b border-surface text-sm font-semibold text-surface-500">
                            Waiting for management to approve
                        </div>
                        <ul class="divide-y divide-surface">
                            @for (order of waiting(); track order.id) {
                                <li class="px-5 py-3 text-sm flex flex-wrap justify-between gap-2">
                                    <span>
                                        {{ order.supplierName || 'No supplier yet' }} · order no.
                                        <span class="font-mono">{{ order.id }}</span>
                                    </span>
                                    <span class="text-surface-500">{{ orderSummary(order) }}</span>
                                </li>
                            }
                        </ul>
                    </div>
                }
            }

            <!-- ── The checklist ───────────────────────────────────────────── -->
            @if (mode() === 'check') {
                <div
                    class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-5 space-y-4">
                    @if (po(); as order) {
                        <div class="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div class="text-lg font-semibold">{{ order.supplierName }}</div>
                                <div class="text-sm text-surface-500">
                                    Order no. <span class="font-mono">{{ order.id }}</span> · raised
                                    {{ day(order.raisedAt) }} by {{ order.raisedBy }}
                                    @if (order.neededBy) {
                                        · needed by {{ order.neededBy }}
                                    }
                                </div>
                            </div>
                            <button
                                pButton
                                size="small"
                                outlined
                                icon="pi pi-print"
                                label="Print checklist"
                                (click)="printChecklist({ po: order.id })"></button>
                        </div>
                    } @else {
                        <div>
                            <label class="block text-sm font-medium mb-1 app-req" for="grn-supplier">
                                Who delivered it?
                            </label>
                            <select
                                id="grn-supplier"
                                class="w-full md:w-96 px-3 py-2.5 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"
                                [ngModel]="supplierId()"
                                (ngModelChange)="supplierId.set($event === null ? null : +$event)">
                                <option [ngValue]="null">Choose a supplier…</option>
                                @for (s of suppliers(); track s.id) {
                                    <option [ngValue]="s.id">{{ s.name }}</option>
                                }
                            </select>
                        </div>
                    }

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                        <div>
                            <label class="block text-sm font-medium mb-1" for="grn-invoice">
                                Invoice number
                                <span class="text-surface-500 font-normal">- if there is one</span>
                            </label>
                            <input
                                id="grn-invoice"
                                pInputText
                                class="w-full"
                                placeholder="e.g. INV-10423"
                                [ngModel]="invoiceNo()"
                                (ngModelChange)="invoiceNo.set($event)" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1" for="grn-invoice-date">
                                Date on the invoice
                            </label>
                            <input
                                id="grn-invoice-date"
                                type="date"
                                pInputText
                                class="w-full"
                                [ngModel]="invoiceDate()"
                                (ngModelChange)="invoiceDate.set($event)" />
                        </div>
                    </div>
                </div>

                @if (po()) {
                    <div
                        class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                        <div class="px-5 py-3 border-b border-surface flex flex-wrap items-center justify-between gap-2">
                            <span class="font-semibold">
                                On the order
                                <span class="text-surface-500 font-normal text-sm">
                                    · {{ tickedCount() }} of {{ checks().length }} ticked
                                </span>
                            </span>
                            <button
                                pButton
                                size="small"
                                [outlined]="!allTicked()"
                                [text]="allTicked()"
                                [icon]="allTicked() ? 'pi pi-times' : 'pi pi-check-square'"
                                [label]="allTicked() ? 'Untick all' : 'Everything came - tick all'"
                                (click)="tickAll(!allTicked())"></button>
                        </div>
                        <p class="px-5 pt-3 text-xs text-surface-500">
                            Tick each item that came off the lorry. Change the number if fewer came.
                            Anything not ticked stays on the order as still to come.
                        </p>
                        <ul class="divide-y divide-surface">
                            @for (row of checks(); track row.lineId) {
                                <li
                                    class="px-5 py-3 space-y-2"
                                    [class.bg-primary-50]="row.ticked"
                                    [class.dark:bg-primary-950]="row.ticked">
                                    <div class="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            class="w-6 h-6 shrink-0 accent-[var(--p-primary-color)]"
                                            [id]="'chk-' + row.lineId"
                                            [attr.aria-label]="'Arrived: ' + row.name"
                                            [checked]="row.ticked"
                                            (change)="tick(row.lineId, !row.ticked)" />
                                        <label
                                            [for]="'chk-' + row.lineId"
                                            class="min-w-0 flex-1 cursor-pointer flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1">
                                            <span class="min-w-0">
                                                <span class="block font-medium">{{ row.name }}</span>
                                                <span class="block text-xs text-surface-500">
                                                    @if (row.itemId === null) {
                                                        not a stock item
                                                    } @else {
                                                        {{ row.code }}
                                                    }
                                                </span>
                                            </span>
                                            <span class="text-right">
                                                <span class="block font-semibold">{{ expectedPacks(row) }}</span>
                                                @if (expectedBase(row); as base) {
                                                    <span class="block text-xs text-surface-500">{{ base }} expected</span>
                                                }
                                            </span>
                                        </label>
                                        @if (!row.ticked && canVoid()) {
                                            <button
                                                pButton
                                                size="small"
                                                text
                                                severity="danger"
                                                label="Void"
                                                [attr.aria-label]="'Take ' + row.name + ' off the order'"
                                                [disabled]="saving()"
                                                (click)="voidLine(row)"></button>
                                        }
                                    </div>

                                    @if (row.ticked) {
                                        <div class="flex flex-wrap items-end gap-3 pl-9">
                                            <div>
                                                <label class="block text-xs text-surface-500 mb-1" [for]="'qty-' + row.lineId">
                                                    How many came?
                                                </label>
                                                <div class="flex items-center gap-2">
                                                    <input
                                                        pInputText
                                                        class="w-24 text-right"
                                                        inputmode="decimal"
                                                        [id]="'qty-' + row.lineId"
                                                        [ngModel]="row.qty"
                                                        (ngModelChange)="setCheckQty(row.lineId, $event)" />
                                                    <span class="text-sm text-surface-500">
                                                        {{ row.itemId === null ? row.unit || 'each' : '× ' + row.packName }}
                                                    </span>
                                                </div>
                                            </div>
                                            @if (row.itemId !== null) {
                                                <div>
                                                    <label class="block text-xs text-surface-500 mb-1" [for]="'exp-' + row.lineId">
                                                        Expiry
                                                        <span class="font-normal">- optional</span>
                                                    </label>
                                                    <input
                                                        pInputText
                                                        type="date"
                                                        class="w-40"
                                                        [id]="'exp-' + row.lineId"
                                                        [ngModel]="row.expiry"
                                                        (ngModelChange)="setCheckExpiry(row.lineId, $event)" />
                                                </div>
                                                <div class="text-sm text-surface-500 pb-2">
                                                    = {{ checkBase(row) }}
                                                </div>
                                            }
                                            @if (shortOf(row); as short) {
                                                <div class="text-sm text-orange-600 pb-2">
                                                    {{ short }} still to come
                                                </div>
                                            }
                                            @if (overOf(row); as over) {
                                                <div class="w-full app-note app-note--error !py-2">
                                                    <strong>{{ over }} more than is still owed.</strong>
                                                    Only {{ expectedPacks(row) }} was left on the order. It will be
                                                    received, and management will be asked to check it - make sure it
                                                    is not something already credited or sent twice.
                                                </div>
                                            }
                                        </div>

                                        @if (!row.bad) {
                                            <div class="pl-9">
                                                <button
                                                    pButton
                                                    size="small"
                                                    text
                                                    severity="warn"
                                                    icon="pi pi-replay"
                                                    label="Some are bad - send them back"
                                                    (click)="openBad(row.lineId)"></button>
                                            </div>
                                        } @else {
                                            <div class="ml-9 rounded-xl border border-orange-300 dark:border-orange-700 overflow-hidden">
                                                <div
                                                    class="px-4 py-2 bg-orange-50 dark:bg-orange-950 flex items-center justify-between gap-2">
                                                    <span class="text-sm font-semibold text-orange-700 dark:text-orange-300">
                                                        <i class="pi pi-replay mr-1" aria-hidden="true"></i>
                                                        Going back with the driver
                                                    </span>
                                                    <button
                                                        pButton
                                                        size="small"
                                                        text
                                                        label="Nothing is bad"
                                                        (click)="closeBad(row.lineId)"></button>
                                                </div>
                                                <div class="p-4 space-y-3">
                                                    <div class="flex flex-wrap items-end gap-3">
                                                        <div>
                                                            <label class="block text-xs text-surface-500 mb-1" [for]="'bad-' + row.lineId">
                                                                How many are bad?
                                                            </label>
                                                            <div class="flex items-center gap-2">
                                                                <input
                                                                    pInputText
                                                                    class="w-24 text-right"
                                                                    inputmode="decimal"
                                                                    [id]="'bad-' + row.lineId"
                                                                    [ngModel]="row.badQty"
                                                                    (ngModelChange)="patchCheck(row.lineId, { badQty: num($event) })" />
                                                                <span class="text-sm text-surface-500">
                                                                    {{ row.itemId === null ? row.unit || 'each' : '× ' + row.packName }}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div class="flex-1 min-w-52">
                                                            <label class="block text-xs text-surface-500 mb-1" [for]="'why-' + row.lineId">
                                                                Why?
                                                            </label>
                                                            <select
                                                                class="w-full px-3 py-2.5 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm"
                                                                [id]="'why-' + row.lineId"
                                                                [ngModel]="row.badReason"
                                                                (ngModelChange)="patchCheck(row.lineId, { badReason: $event })">
                                                                <option value="">Choose a reason…</option>
                                                                @for (r of returnReasons(); track r.code) {
                                                                    <option [value]="r.code">{{ r.label }}</option>
                                                                }
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs text-surface-500 mb-1" [for]="'note-' + row.lineId">
                                                            Note <span class="font-normal">- optional</span>
                                                        </label>
                                                        <input
                                                            pInputText
                                                            class="w-full"
                                                            placeholder="e.g. bottom of the sack wet"
                                                            [id]="'note-' + row.lineId"
                                                            [ngModel]="row.badNote"
                                                            (ngModelChange)="patchCheck(row.lineId, { badNote: $event })" />
                                                    </div>
                                                    <div>
                                                        <div class="text-xs text-surface-500 mb-1">What does the supplier owe for them?</div>
                                                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
                                                            @for (o of outcomes; track o.value) {
                                                                <button
                                                                    type="button"
                                                                    role="radio"
                                                                    [attr.aria-checked]="row.badOutcome === o.value"
                                                                    class="text-left px-3 py-2 rounded-lg border"
                                                                    [class.border-primary]="row.badOutcome === o.value"
                                                                    [class.bg-primary-50]="row.badOutcome === o.value"
                                                                    [class.dark:bg-primary-950]="row.badOutcome === o.value"
                                                                    [class.border-surface]="row.badOutcome !== o.value"
                                                                    (click)="patchCheck(row.lineId, { badOutcome: o.value })">
                                                                    <span class="block text-sm font-medium">
                                                                        <i
                                                                            class="pi mr-1"
                                                                            [class.pi-check-circle]="row.badOutcome === o.value"
                                                                            [class.pi-circle]="row.badOutcome !== o.value"
                                                                            aria-hidden="true"></i>
                                                                        {{ o.label }}
                                                                    </span>
                                                                    <span class="block text-xs text-surface-500">{{ o.hint }}</span>
                                                                </button>
                                                            }
                                                        </div>
                                                    </div>
                                                    @if (badSummary(row); as summary) {
                                                        <div class="text-sm font-medium">{{ summary }}</div>
                                                    }
                                                </div>
                                            </div>
                                        }
                                    }
                                </li>
                            }
                        </ul>
                    </div>
                }

                <!-- Not on the order (or no order at all). -->
                <div
                    class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 md:p-5 space-y-3">
                    <div class="font-semibold">
                        {{ po() ? 'Anything else that came' : 'What came' }}
                    </div>
                    @if (po() && extras().length > 0) {
                        <p class="text-sm text-surface-500">
                            The order does not still ask for anything added here. It will be received,
                            and the delivery goes to management to check.
                        </p>
                    }
                    @for (row of extras(); track row.key) {
                        <div class="flex flex-wrap items-end gap-3 border-b border-surface pb-3">
                            <div class="flex-1 min-w-56">
                                <app-item-picker
                                    label="Product"
                                    [items]="items()"
                                    [value]="row.itemId"
                                    (valueChange)="setExtraItem(row.key, $event)" />
                            </div>
                            <div>
                                <label class="block text-xs text-surface-500 mb-1">Pack</label>
                                <select
                                    class="w-36 px-2 py-2.5 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm"
                                    [disabled]="!row.itemId"
                                    [ngModel]="row.packId"
                                    (ngModelChange)="patchExtra(row.key, { packId: +$event })">
                                    @for (p of packsFor(row.itemId); track p.id) {
                                        <option [ngValue]="p.id">{{ p.packName }}</option>
                                    }
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs text-surface-500 mb-1">How many?</label>
                                <input
                                    pInputText
                                    class="w-20 text-right"
                                    inputmode="decimal"
                                    [ngModel]="row.qty"
                                    (ngModelChange)="patchExtra(row.key, { qty: num($event) })" />
                            </div>
                            <div>
                                <label class="block text-xs text-surface-500 mb-1">Expiry</label>
                                <input
                                    pInputText
                                    type="date"
                                    class="w-40"
                                    [ngModel]="row.expiry"
                                    (ngModelChange)="patchExtra(row.key, { expiry: $event })" />
                            </div>
                            <button
                                pButton
                                text
                                severity="danger"
                                icon="pi pi-times"
                                aria-label="Remove this line"
                                (click)="removeExtra(row.key)"></button>
                        </div>
                    }
                    <button
                        pButton
                        outlined
                        size="small"
                        icon="pi pi-plus"
                        [label]="extras().length === 0 && !po() ? 'Add the first item' : 'Add an item'"
                        (click)="addExtra()"></button>
                </div>

                <div
                    class="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-surface bg-surface-0/95 dark:bg-surface-900/95 backdrop-blur shadow-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        @if (po()) {
                            <span>
                                <i class="pi pi-check-square text-primary mr-1" aria-hidden="true"></i>
                                <strong>{{ tickedCount() }}</strong> of {{ checks().length }} ticked
                            </span>
                            @if (badCount() > 0) {
                                <span class="text-orange-600">
                                    <i class="pi pi-replay mr-1" aria-hidden="true"></i>
                                    {{ badCount() }} going back
                                </span>
                            }
                            @if (overCount() > 0) {
                                <span class="text-red-600 dark:text-red-400">
                                    <i class="pi pi-exclamation-triangle mr-1" aria-hidden="true"></i>
                                    {{ overCount() }} more than owed
                                </span>
                            }
                            @if (checks().length - tickedCount() > 0) {
                                <span class="text-surface-500">
                                    <i class="pi pi-clock mr-1" aria-hidden="true"></i>
                                    {{ checks().length - tickedCount() }} still to come
                                </span>
                            }
                        }
                        @if (blocker(); as why) {
                            <span class="text-surface-500">· {{ why }}</span>
                        }
                    </div>
                    <button
                        pButton
                        icon="pi pi-check"
                        [label]="saveLabel()"
                        [disabled]="blocker() !== null || saving()"
                        [loading]="saving()"
                        (click)="submit()"></button>
                </div>
            }

            <!-- ── Saved ───────────────────────────────────────────────────── -->
            @if (mode() === 'saved') {
                @if (saved(); as d) {
                    <div
                        class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                        <div class="px-5 py-4 border-b border-surface">
                            <div class="font-semibold text-lg">Delivery recorded</div>
                            <p class="text-sm text-surface-500 mt-0.5">
                                {{ d.supplierName }} · delivery no.
                                <span class="font-mono">{{ d.id }}</span>
                                @if (d.invoiceNo) {
                                    · invoice {{ d.invoiceNo }}
                                }
                                · {{ when(d.receivedAt) }}
                            </p>
                        </div>
                        <ul class="divide-y divide-surface">
                            @for (line of d.lines; track line.id) {
                                <li class="px-5 py-3 flex flex-wrap justify-between gap-3">
                                    <span class="font-medium">{{ line.itemName }}</span>
                                    <span class="text-sm text-right">
                                        {{ line.qtyPacks }} × {{ line.packName }}
                                        <span class="block text-xs text-surface-500">
                                            = {{ q(line.qtyBase, line.stockUnit) }}
                                            @if (line.expiryDate) {
                                                · expires {{ line.expiryDate }}
                                            }
                                        </span>
                                    </span>
                                </li>
                            }
                            @for (line of d.otherLines; track line.id) {
                                <li class="px-5 py-3 flex flex-wrap justify-between gap-3">
                                    <span class="font-medium">
                                        {{ line.name }}
                                        <span class="text-xs text-surface-500 font-normal">· not a stock item</span>
                                    </span>
                                    <span class="text-sm">{{ line.qty }} {{ line.unit || 'each' }}</span>
                                </li>
                            }
                        </ul>
                        @if (d.rejections.length > 0) {
                            <div class="px-5 py-3 border-t border-surface">
                                <div class="font-medium text-orange-700 dark:text-orange-300">
                                    <i class="pi pi-replay mr-1" aria-hidden="true"></i>
                                    Sent back with the driver
                                </div>
                                <ul class="text-sm mt-1 space-y-1">
                                    @for (r of d.rejections; track r.id) {
                                        <li>
                                            {{ r.name }} - {{ rejectionQty(r) }} · {{ r.reasonLabel }}
                                            @if (r.note) {
                                                <span class="text-surface-500">(“{{ r.note }}”)</span>
                                            }
                                            ·
                                            <span class="font-medium">
                                                {{ r.outcome === 'credit' ? 'credit note' : 'replacement' }}
                                            </span>
                                        </li>
                                    }
                                </ul>
                            </div>
                        }
                        @if (stillToCome(d).length > 0) {
                            <div class="px-5 py-3 border-t border-surface app-note app-note--warn !rounded-none">
                                <div class="font-medium">Still to come on this order</div>
                                <ul class="text-sm mt-1">
                                    @for (l of stillToCome(d); track $index) {
                                        <li>{{ l.name }} - {{ q(l.qtyOutstandingBase, l.unit) }}</li>
                                    }
                                </ul>
                                <p class="text-xs mt-1">The order stays open until they come, or management voids them.</p>
                            </div>
                        } @else if (d.order) {
                            <div class="px-5 py-3 border-t border-surface text-sm text-surface-500">
                                Nothing else is outstanding - the order is closed.
                            </div>
                        }
                        @if (d.needsReview) {
                            <div class="px-5 py-3 border-t border-surface app-note !rounded-none">
                                <i class="pi pi-send mr-1" aria-hidden="true"></i>
                                Management has been sent a report of this delivery: what came, what went
                                back and what is still to come.
                            </div>
                        }
                        <div class="px-5 py-4 border-t border-surface flex flex-wrap items-center gap-3">
                            <button
                                pButton
                                icon="pi pi-print"
                                label="Print delivery note"
                                (click)="print(d.id)"></button>
                            <button
                                pButton
                                outlined
                                icon="pi pi-truck"
                                label="Next delivery"
                                (click)="backToList()"></button>
                            <a pButton text label="All deliveries" routerLink="/deliveries"></a>
                        </div>
                    </div>
                } @else {
                    <p class="text-surface-500">Loading…</p>
                }
            }
        </div>
    `
})
export class GrnComponent implements OnInit {
    private auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    readonly mode = signal<'list' | 'check' | 'saved'>('list');

    readonly openOrders = signal<PurchaseOrder[]>([]);
    readonly loadingOrders = signal(false);
    readonly items = signal<Item[]>([]);
    readonly suppliers = signal<Supplier[]>([]);

    /** The order being received, or null for a delivery nobody ordered. */
    readonly po = signal<PurchaseOrder | null>(null);
    readonly supplierId = signal<number | null>(null);
    readonly invoiceNo = signal('');
    readonly invoiceDate = signal('');
    readonly checks = signal<CheckRow[]>([]);
    readonly extras = signal<ExtraRow[]>([]);

    readonly saving = signal(false);
    readonly error = signal<string | null>(null);
    readonly saved = signal<GrnDetail | null>(null);
    readonly returnReasons = signal<ReasonCode[]>([]);

    readonly outcomes: { value: RejectionOutcome; label: string; hint: string }[] = [
        {
            value: 'replacement',
            label: 'Send a replacement',
            hint: 'Stays on the order as still to come'
        },
        {
            value: 'credit',
            label: 'Credit note',
            hint: 'Comes off the order; management records the note'
        }
    ];

    /** Minted once per delivery, not per press of Save. */
    private idempotencyKey = uuid();

    readonly canVoid = computed(() => this.auth.role() === 'management');

    /** Orders a delivery can be booked against. */
    readonly expected = computed(() =>
        this.openOrders().filter(
            (o) => (o.status === 'approved' || o.status === 'ordered') && this.outstandingCount(o) > 0
        )
    );
    readonly waiting = computed(() => this.openOrders().filter((o) => o.status === 'requested'));

    readonly groups = computed<SupplierGroup[]>(() => {
        const by = new Map<string, SupplierGroup>();
        for (const o of this.expected()) {
            const name = o.supplierName ?? 'No supplier yet';
            const g = by.get(name) ?? { supplierId: o.supplierId, supplierName: name, orders: [] };
            g.orders.push(o);
            by.set(name, g);
        }
        return [...by.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
    });

    readonly tickedCount = computed(() => this.checks().filter((c) => c.ticked).length);
    readonly allTicked = computed(
        () => this.checks().length > 0 && this.checks().every((c) => c.ticked)
    );

    /** Extras that are filled in enough to send. */
    private readonly completeExtras = computed(() =>
        this.extras().filter((e) => e.itemId !== null && e.packId !== null && (e.qty ?? 0) > 0)
    );

    readonly lineTotal = computed(() => this.tickedCount() + this.completeExtras().length);

    readonly badCount = computed(() => this.checks().filter((c) => c.ticked && c.bad).length);

    readonly saveLabel = computed(() => {
        const n = this.lineTotal();
        const back = this.badCount();
        if (!n) return 'Save delivery';
        return back ? `Save delivery (${n}) · ${back} going back` : `Save delivery (${n})`;
    });

    /** Why Save is not available, in the words of what is missing. */
    readonly blocker = computed<string | null>(() => {
        if (!this.po() && this.supplierId() === null) return 'Choose who delivered it';
        const badTick = this.checks().find((c) => c.ticked && !((c.qty ?? 0) > 0));
        if (badTick) return `How many ${badTick.name} came?`;
        for (const c of this.checks().filter((x) => x.ticked && x.bad)) {
            if (!((c.badQty ?? 0) > 0)) return `How many ${c.name} are bad?`;
            if ((c.badQty ?? 0) > (c.qty ?? 0)) {
                return `More ${c.name} are bad than came - check the numbers`;
            }
            if (!c.badReason) return `Why is ${c.name} going back?`;
        }
        const badExtra = this.extras().find(
            (e) => !(e.itemId !== null && e.packId !== null && (e.qty ?? 0) > 0)
        );
        if (badExtra) return 'Finish or remove the item you added';
        if (this.lineTotal() === 0) return this.po() ? 'Tick what came' : 'Add what came';
        return null;
    });

    async ngOnInit(): Promise<void> {
        try {
            const [items, suppliers, reasons] = await Promise.all([
                this.api.listItems(),
                this.api.listSuppliers(),
                this.api.reasonCodes('return')
            ]);
            this.items.set(items);
            this.suppliers.set(suppliers);
            this.returnReasons.set(reasons);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        }
        await this.loadOrders();

        // Sent here from an order on the Purchases screen.
        const poId = this.route.snapshot.queryParamMap.get('po');
        if (poId) {
            const order = this.openOrders().find((o) => o.id === poId);
            if (order && this.expected().includes(order)) this.open(order);
            else this.error.set('That order is not waiting for a delivery. Pick one from the list.');
            void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
        }
    }

    private async loadOrders(): Promise<void> {
        this.loadingOrders.set(true);
        try {
            const page = await this.api.listPurchaseOrders({ open: true, limit: 100 });
            this.openOrders.set(page.items);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loadingOrders.set(false);
        }
    }

    // ── Starting a delivery ─────────────────────────────────────────────────

    open(order: PurchaseOrder): void {
        this.reset();
        this.po.set(order);
        this.supplierId.set(order.supplierId);
        this.checks.set(
            order.lines
                .filter((l) => !l.voided && l.qtyOutstandingBase > 0)
                .map((l) => this.checkFrom(l))
        );
        this.mode.set('check');
    }

    startManual(): void {
        this.reset();
        this.addExtra();
        this.mode.set('check');
    }

    async backToList(): Promise<void> {
        this.reset();
        this.mode.set('list');
        await this.loadOrders();
    }

    private reset(): void {
        this.error.set(null);
        this.saved.set(null);
        this.po.set(null);
        this.supplierId.set(null);
        this.invoiceNo.set('');
        this.invoiceDate.set('');
        this.checks.set([]);
        this.extras.set([]);
        // A different delivery deserves a different key.
        this.idempotencyKey = uuid();
    }

    private checkFrom(l: PurchaseOrderLine): CheckRow {
        if (l.itemId === null) {
            return {
                lineId: l.id,
                itemId: null,
                name: l.name,
                code: null,
                unit: l.stockUnit,
                packId: null,
                packName: null,
                packSize: null,
                outstanding: l.qtyOutstandingBase,
                ticked: false,
                qty: null,
                expiry: '',
                ...NO_BAD
            };
        }
        const item = this.items().find((i) => i.id === l.itemId);
        const pack =
            item?.packs.find((p) => p.id === l.itemPackId) ??
            item?.packs.find((p) => p.isDefaultPurchase) ??
            item?.packs[0];
        const size = pack?.qtyInStockUnit ?? 1;
        return {
            lineId: l.id,
            itemId: l.itemId,
            name: l.name,
            code: item?.code ?? null,
            unit: l.stockUnit,
            packId: pack?.id ?? null,
            packName: pack?.packName ?? l.packName ?? 'pack',
            packSize: size,
            outstanding: round3(l.qtyOutstandingBase / size),
            ticked: false,
            qty: null,
            expiry: '',
            ...NO_BAD
        };
    }

    // ── The checklist ───────────────────────────────────────────────────────

    tick(lineId: string, on: boolean): void {
        this.checks.update((rows) =>
            rows.map((r) =>
                r.lineId === lineId
                    ? // A tick means it all came; the amount can be changed after.
                      { ...r, ticked: on, qty: on ? (r.qty ?? r.outstanding) : r.qty, ...(on ? {} : NO_BAD) }
                    : r
            )
        );
    }

    tickAll(on: boolean): void {
        for (const r of this.checks()) if (r.ticked !== on) this.tick(r.lineId, on);
    }

    setCheckQty(lineId: string, value: string | number | null): void {
        this.checks.update((rows) =>
            rows.map((r) => (r.lineId === lineId ? { ...r, qty: this.num(value) } : r))
        );
    }

    patchCheck(lineId: string, patch: Partial<CheckRow>): void {
        this.checks.update((rows) => rows.map((r) => (r.lineId === lineId ? { ...r, ...patch } : r)));
    }

    openBad(lineId: string): void {
        this.patchCheck(lineId, { bad: true });
    }

    closeBad(lineId: string): void {
        this.patchCheck(lineId, NO_BAD);
    }

    /** "8 × 500 g pack into stock · 2 going back, replacement owed" */
    badSummary(row: CheckRow): string | null {
        const came = row.qty ?? 0;
        const bad = row.badQty ?? 0;
        if (!(bad > 0) || bad > came) return null;
        const good = round3(came - bad);
        const unit = row.itemId === null ? ` ${row.unit || 'each'}` : ` × ${row.packName}`;
        const owed = row.badOutcome === 'credit' ? 'credit note owed' : 'replacement owed';
        if (good <= 0) return `None into stock · all ${bad} going back, ${owed}`;
        return `${good}${unit} into stock · ${bad} going back, ${owed}`;
    }

    rejectionQty(r: { qty: number; packName: string | null; unit: string | null; isStockItem: boolean }): string {
        return r.isStockItem ? `${r.qty} × ${r.packName}` : `${r.qty} ${r.unit || 'each'}`;
    }

    setCheckExpiry(lineId: string, value: string): void {
        this.checks.update((rows) =>
            rows.map((r) => (r.lineId === lineId ? { ...r, expiry: value } : r))
        );
    }

    checkBase(row: CheckRow): string {
        if (row.packSize === null || !row.unit) return '';
        const good = Math.max(0, (row.qty ?? 0) - (row.bad ? (row.badQty ?? 0) : 0));
        return formatQty(good * row.packSize, row.unit) + (row.bad ? ' into stock' : '');
    }

    /** More came off the lorry, good and bad together, than the order still owes. */
    overOf(row: CheckRow): string | null {
        if (!row.ticked) return null;
        const extra = round3((row.qty ?? 0) - row.outstanding);
        if (extra <= 0) return null;
        return row.itemId === null ? `${extra} ${row.unit || 'each'}` : `${extra} × ${row.packName}`;
    }

    /** Lines over what is owed, plus items added on an order delivery. */
    readonly overCount = computed(
        () =>
            this.checks().filter((c) => this.overOf(c) !== null).length +
            (this.po() ? this.completeExtras().length : 0)
    );

    /** The part of a ticked line that did not come, if any. */
    shortOf(row: CheckRow): string | null {
        const gap = round3(row.outstanding - (row.qty ?? 0));
        if (gap <= 0) return null;
        return row.itemId === null ? `${gap} ${row.unit || 'each'}` : `${gap} × ${row.packName}`;
    }

    /**
     * Take one line off the order. Management only, and only with a reason -
     * in a month "why did we never get the cream" is a real question.
     */
    async voidLine(row: CheckRow): Promise<void> {
        const order = this.po();
        if (!order) return;
        const reason = await this.notify.prompt(
            `${row.name} will be taken off order no. ${order.id}. What it was ordered for stays on record. Why is it not coming?`,
            'Void this item',
            '',
            'Void it'
        );
        if (!reason || reason.trim().length < 3) {
            if (reason !== null && reason !== undefined) this.notify.warning('Give a short reason.');
            return;
        }
        try {
            const res = await this.api.voidPoLine(order.id, row.lineId, reason.trim());
            this.checks.update((rows) => rows.filter((r) => r.lineId !== row.lineId));
            if (res.orderComplete) {
                this.notify.success(`${row.name} voided. Nothing else is outstanding - the order is closed.`);
                await this.backToList();
            } else {
                this.notify.success(`${row.name} taken off the order`);
            }
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        }
    }

    // ── Extras ──────────────────────────────────────────────────────────────

    addExtra(): void {
        this.extras.update((rows) => [
            ...rows,
            { key: uuid(), itemId: null, packId: null, qty: null, expiry: '' }
        ]);
    }

    removeExtra(key: string): void {
        this.extras.update((rows) => rows.filter((r) => r.key !== key));
    }

    patchExtra(key: string, patch: Partial<ExtraRow>): void {
        this.extras.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    }

    setExtraItem(key: string, itemId: number | null): void {
        const item = this.items().find((i) => i.id === itemId);
        const pack = item?.packs.find((p) => p.isDefaultPurchase) ?? item?.packs[0];
        this.patchExtra(key, { itemId, packId: pack?.id ?? null });
    }

    packsFor(itemId: number | null): ItemPack[] {
        if (itemId === null) return [];
        return this.items().find((i) => i.id === itemId)?.packs ?? [];
    }

    num(value: string | number | null): number | null {
        const text = String(value ?? '').trim();
        if (text === '') return null;
        const n = Number(text);
        return isNaN(n) || n < 0 ? null : n;
    }

    // ── Saving ──────────────────────────────────────────────────────────────

    async submit(): Promise<void> {
        if (this.blocker() !== null) return;
        const ticked = this.checks().filter((c) => c.ticked && (c.qty ?? 0) > 0);

        this.saving.set(true);
        this.error.set(null);
        try {
            const result = await this.api.createGrn(
                {
                    supplierId: this.supplierId()!,
                    poId: this.po()?.id ?? null,
                    invoiceNo: this.invoiceNo().trim() || null,
                    invoiceDate: this.invoiceDate() || null,
                    lines: [
                        ...ticked
                            .filter((c) => c.itemId !== null && c.packId !== null && good(c) > 0)
                            .map((c) => ({
                                itemPackId: c.packId!,
                                qtyPacks: good(c),
                                expiryDate: c.expiry || null
                            })),
                        ...this.completeExtras().map((e) => ({
                            itemPackId: e.packId!,
                            qtyPacks: e.qty!,
                            expiryDate: e.expiry || null
                        }))
                    ],
                    otherLines: ticked
                        .filter((c) => c.itemId === null && good(c) > 0)
                        .map((c) => ({ poLineId: c.lineId, qty: good(c) })),
                    rejections: ticked
                        .filter((c) => c.bad && (c.badQty ?? 0) > 0)
                        .map((c) => ({
                            poLineId: c.lineId,
                            qty: c.badQty!,
                            reasonCode: c.badReason,
                            note: c.badNote.trim() || null,
                            outcome: c.badOutcome
                        }))
                },
                this.idempotencyKey
            );
            this.notify.success(
                result.needsReview
                    ? 'Delivery recorded, and a report sent to management'
                    : `Delivery recorded. ${result.lineCount} line(s).`
            );
            this.mode.set('saved');
            // Read back from the server: what it holds is what gets printed.
            this.saved.set(await this.api.getGrn(result.id));
        } catch (err) {
            // Nothing was written - the delivery and its ledger rows go in one
            // transaction. The key is deliberately NOT renewed: if this was a
            // lost response, the retry replays the first result.
            this.error.set(apiErrorMessage(err));
            if (this.mode() === 'saved' && !this.saved()) this.mode.set('list');
        } finally {
            this.saving.set(false);
        }
    }

    print(grnId: string): void {
        openPrint(`/deliveries/${grnId}/print`);
    }

    /** What is still to come, on paper: one supplier, one order, or all of it. */
    printChecklist(filter: { supplier?: number | null; po?: string } = {}): void {
        const query: Record<string, string> = {};
        if (filter.supplier) query['supplier'] = String(filter.supplier);
        if (filter.po) query['po'] = filter.po;
        openPrint('/expected-deliveries/print', query);
    }

    phoneOf(supplierId: number | null): string | null {
        return this.suppliers().find((s) => s.id === supplierId)?.phone ?? null;
    }

    /** "20 × 1 L pack" */
    expectedPacks(row: CheckRow): string {
        return row.itemId === null
            ? `${row.outstanding} ${row.unit || 'each'}`
            : `${row.outstanding} × ${row.packName}`;
    }

    /** "20 L" - the same thing in what the shelf counts. */
    expectedBase(row: CheckRow): string | null {
        if (row.itemId === null || row.packSize === null || !row.unit) return null;
        return formatQty(row.outstanding * row.packSize, row.unit);
    }

    // ── Display ─────────────────────────────────────────────────────────────

    stillToCome(d: GrnDetail) {
        return d.order?.lines.filter((l) => l.qtyOutstandingBase > 0) ?? [];
    }

    outstandingCount(order: PurchaseOrder): number {
        return order.lines.filter((l) => !l.voided && l.qtyOutstandingBase > 0).length;
    }

    /** "Rice 2 × 25 kg sack · Sugar …" - enough to recognise it by. */
    orderSummary(order: PurchaseOrder): string {
        const outstanding = order.lines.filter((l) => !l.voided && l.qtyOutstandingBase > 0);
        const shown = outstanding.slice(0, 3).map((l) => l.name);
        const rest = outstanding.length - shown.length;
        if (rest > 0) shown.push(`and ${rest} more`);
        return shown.join(' · ') || `${order.lines.length} item(s)`;
    }

    day(iso: string): string {
        return new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' });
    }

    when(iso: string): string {
        return new Date(iso).toLocaleString('en-LK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    q(qty: number, unit: string | null): string {
        return formatQty(qty, unit ?? '');
    }
}

/** Packs can be fractional -- half a sack gets delivered -- but not endlessly. */
function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/** A line with nothing being sent back. */
const NO_BAD = {
    bad: false,
    badQty: null,
    badReason: '',
    badNote: '',
    badOutcome: 'replacement' as RejectionOutcome
};

/** What goes into stock: what came, less what is going straight back. */
function good(c: CheckRow): number {
    return round3((c.qty ?? 0) - (c.bad ? (c.badQty ?? 0) : 0));
}
