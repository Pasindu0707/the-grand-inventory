/**
 * Purchases - the whole cycle, not just the decision.
 *
 *   Raise      the storekeeper and management. An order starts from the
 *              supplier: pick who it is going to, and what they deliver is the
 *              list to fill in, quantities in packs. Anything not on their list
 *              can still go on - from the item master, or typed in by name -
 *              and stays on their list for next week. What is running low is
 *              there too, but only when asked for.
 *   Decide     management only, because this is the action that spends money.
 *              Management's own orders are approved by being placed, after a
 *              confirmation step; the storekeeper's wait for them.
 *   Receive    the delivery is a GRN against the order, so a part delivery
 *              leaves the order open on the balance rather than closing it
 *              and losing the four sacks that never came.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DrawerModule } from 'primeng/drawer';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { formatQty } from '@/core/format';
import { openPrint } from '@/core/print';
import {
    DEFAULT_PAGE_SIZE,
    emptyPage,
    type Item,
    type ItemPack,
    type MyContext,
    type Page,
    type PageRequest,
    type PoDecision,
    type PurchaseOrder,
    type PurchaseOrderLine,
    type SuggestedOrderLine,
    type Supplier,
    type SupplierItem
} from '@/core/types';
import { AppPaginator, type PageChange } from '@/shared/paginator.component';
import { AppFilterBar, type FilterOption } from '@/shared/filter-bar.component';
import { AppItemPicker } from '@/shared/item-picker.component';
import { AppSteps, type Step } from '@/shared/steps.component';

/**
 * One row of the order form: something this supplier delivers, with how many
 * to order. A row with no quantity is simply not on the order.
 */
interface OrderRow {
    /** `i<itemId>` or `n<lower-cased name>` - one row per thing. */
    key: string;
    /** Null for a product typed in by name, which is not stock. */
    itemId: number | null;
    name: string;
    code: string | null;
    /** Stock unit for an item; what a named product is counted in. */
    unit: string | null;
    /** The pack it is ordered in. Null for a named product. */
    packId: number | null;
    /** Packs for an item, plain count for a named product. */
    qty: number | null;
    /** Not on the supplier's list until this order puts it there. */
    isNew: boolean;
}

@Component({
    selector: 'app-purchases',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        TagModule,
        DrawerModule,
        AppPaginator,
        AppFilterBar,
        AppItemPicker,
        AppSteps
    ],
    template: `
        <div class="space-y-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Purchase orders</h1>
                    <p class="text-surface-500 text-sm">
                        {{
                            canDecide()
                                ? 'Approve what needs buying, place it with the supplier, and see what has arrived'
                                : 'Order from a supplier, and see what has arrived'
                        }}
                    </p>
                </div>
                @if (canRaise()) {
                    <button
                        pButton
                        icon="pi pi-plus"
                        label="New purchase order"
                        (click)="openRaise()"></button>
                }
            </div>

            @if (error()) {
                <div class="app-note app-note--error">{{ error() }}</div>
            }

            <!-- Find and filter -->
            <div
                class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 space-y-3">
                <div class="flex flex-wrap items-center gap-3">
                    <span class="relative flex-1 min-w-56">
                        <i
                            class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
                            aria-hidden="true"></i>
                        <input
                            pInputText
                            class="w-full !pl-9"
                            placeholder="Search by supplier or order no."
                            aria-label="Search purchase orders"
                            [ngModel]="search()"
                            (ngModelChange)="onSearch($event)" />
                    </span>
                    <!-- Only for people who raise orders rather than decide
                         them: management's job is the whole branch. -->
                    @if (!canDecide()) {
                        <app-filter-bar
                            label="Whose orders"
                            [options]="ownerOptions"
                            [value]="mine()"
                            (valueChange)="setMine($event)" />
                    }
                </div>
                <app-filter-bar
                    label="Filter by status"
                    [options]="filterOptions()"
                    [value]="filter()"
                    (valueChange)="setFilter($event)" />
            </div>

            @if (visible().length === 0) {
                <div
                    class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-10 text-center space-y-3">
                    @if (loading()) {
                        <p class="text-surface-500">Loading…</p>
                    } @else if (search()) {
                        <p class="text-surface-500">No order matches “{{ search() }}”.</p>
                        <button pButton text label="Clear the search" (click)="onSearch('', true)"></button>
                    } @else {
                        <i class="pi pi-inbox text-3xl text-surface-400" aria-hidden="true"></i>
                        <p class="text-surface-500">{{ emptyText() }}</p>
                        @if (canRaise() && (filter() === '' || filter() === 'requested')) {
                            <button
                                pButton
                                icon="pi pi-plus"
                                label="New purchase order"
                                (click)="openRaise()"></button>
                        }
                    }
                </div>
            } @else {
                @for (po of visible(); track po.id) {
                    <div
                        class="rounded-2xl border bg-surface-0 dark:bg-surface-900 overflow-hidden border-surface"
                        [class.border-l-4]="needsMe(po)"
                        [class.border-l-primary]="needsMe(po)">
                        <!-- Who, which, where it stands -->
                        <div class="px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3">
                            <div class="min-w-0 space-y-1">
                                <div class="flex flex-wrap items-baseline gap-x-2">
                                    <span class="text-lg font-semibold">
                                        {{ po.supplierName || 'No supplier chosen yet' }}
                                    </span>
                                    <span class="text-sm text-surface-500">
                                        Order no. <span class="font-mono">{{ po.id }}</span>
                                    </span>
                                </div>
                                <div class="text-xs text-surface-500 flex flex-wrap gap-x-3 gap-y-1">
                                    <span>
                                        <i class="pi pi-user mr-1" aria-hidden="true"></i>
                                        Raised by {{ po.raisedBy }}, {{ day(po.raisedAt) }}
                                    </span>
                                    @if (po.neededBy) {
                                        <span [class.text-red-600]="isLate(po)" [class.font-semibold]="isLate(po)">
                                            <i class="pi pi-calendar mr-1" aria-hidden="true"></i>
                                            {{ dueText(po) }}
                                        </span>
                                    }
                                </div>
                                @if (po.reason) {
                                    <div class="text-sm text-surface-600 dark:text-surface-300 italic">
                                        “{{ po.reason }}”
                                    </div>
                                }
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                @if (isLate(po)) {
                                    <p-tag severity="danger" value="Late"></p-tag>
                                }
                                @if (po.partReceived) {
                                    <p-tag severity="warn" value="Part delivered"></p-tag>
                                }
                                <p-tag [severity]="tone(po.status)" [value]="label(po.status)"></p-tag>
                            </div>
                        </div>

                        <!-- How much of it has come -->
                        @if (showsProgress(po)) {
                            <div class="px-5 pb-3">
                                <div class="flex justify-between text-xs text-surface-500 mb-1">
                                    <span>{{ arrived(po) }} of {{ activeLines(po) }} items delivered</span>
                                    @if (voidedCount(po) > 0) {
                                        <span>{{ voidedCount(po) }} taken off</span>
                                    }
                                </div>
                                <div
                                    class="h-1.5 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden"
                                    role="progressbar"
                                    [attr.aria-valuenow]="arrived(po)"
                                    [attr.aria-valuemax]="activeLines(po)"
                                    [attr.aria-label]="'Items delivered on order ' + po.id">
                                    <div
                                        class="h-full bg-primary rounded-full transition-all"
                                        [style.width.%]="activeLines(po) ? (arrived(po) / activeLines(po)) * 100 : 0"></div>
                                </div>
                            </div>
                        }

                        <!-- What is on it -->
                        <ul class="border-t border-surface divide-y divide-surface">
                            @for (line of shownLines(po); track line.id) {
                                <li class="px-5 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                    <div class="min-w-0 flex items-center gap-2">
                                        <i
                                            class="pi text-sm"
                                            [class.pi-check-circle]="lineState(line) === 'in'"
                                            [class.text-green-600]="lineState(line) === 'in'"
                                            [class.pi-circle]="lineState(line) === 'waiting'"
                                            [class.text-surface-400]="lineState(line) === 'waiting' || lineState(line) === 'void'"
                                            [class.pi-clock]="lineState(line) === 'part'"
                                            [class.text-orange-500]="lineState(line) === 'part'"
                                            [class.pi-ban]="lineState(line) === 'void'"
                                            aria-hidden="true"></i>
                                        <span class="min-w-0">
                                            <span class="font-medium" [class.line-through]="line.voided" [class.text-surface-400]="line.voided">
                                                {{ line.name }}
                                            </span>
                                            <span class="block text-xs text-surface-500">
                                                @if (line.voided) {
                                                    taken off by {{ line.voidedBy }} - “{{ line.voidReason }}”
                                                } @else if (!line.isStockItem) {
                                                    not a stock item
                                                } @else if (po.status === 'requested') {
                                                    @if (line.qtyInStore > 0) {
                                                        store has {{ q(line.qtyInStore, line.stockUnit) }}
                                                    } @else {
                                                        <span class="text-orange-600">none in the store</span>
                                                    }
                                                } @else {
                                                    {{ lineProgress(line) }}
                                                }
                                            </span>
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-right">
                                            <span class="block font-semibold text-sm">{{ ordered(line) }}</span>
                                            @if (line.isStockItem && line.qtyPacks !== null) {
                                                <span class="block text-xs text-surface-500">{{ q(line.qtyBase, line.stockUnit) }}</span>
                                            }
                                        </span>
                                        @if (
                                            canDecide() &&
                                            line.qtyOutstandingBase > 0 &&
                                            (po.status === 'approved' || po.status === 'ordered')
                                        ) {
                                            <button
                                                pButton
                                                size="small"
                                                text
                                                rounded
                                                severity="danger"
                                                icon="pi pi-ban"
                                                [attr.title]="'Take ' + line.name + ' off the order'"
                                                [attr.aria-label]="'Take ' + line.name + ' off the order'"
                                                [disabled]="busy()"
                                                (click)="voidLine(po, line)"></button>
                                        }
                                    </div>
                                </li>
                            }
                        </ul>
                        @if (po.lines.length > LINES_SHOWN) {
                            <button
                                type="button"
                                class="w-full px-5 py-2 text-sm text-primary font-medium border-t border-surface hover:bg-surface-50 dark:hover:bg-surface-800"
                                (click)="toggleLines(po.id)">
                                @if (expanded().has(po.id)) {
                                    <i class="pi pi-chevron-up mr-1" aria-hidden="true"></i> Show fewer
                                } @else {
                                    <i class="pi pi-chevron-down mr-1" aria-hidden="true"></i>
                                    Show all {{ po.lines.length }} items
                                }
                            </button>
                        }

                        @if (po.decidedBy) {
                            <div
                                class="px-5 py-2.5 border-t border-surface bg-surface-50 dark:bg-surface-800 text-sm text-surface-600 dark:text-surface-300">
                                {{ decidedText(po) }} by {{ po.decidedBy }}
                                @if (po.decisionNote) {
                                    - “{{ po.decisionNote }}”
                                }
                            </div>
                        }

                        <!-- What happens next, and the button that does it -->
                        @if (nextStep(po); as next) {
                            <div
                                class="px-5 py-3 border-t border-surface flex flex-wrap items-center justify-between gap-3">
                                <span class="text-sm text-surface-500">
                                    <i class="pi pi-arrow-right mr-1" aria-hidden="true"></i>
                                    {{ next }}
                                </span>
                                <div class="flex flex-wrap items-center gap-2">
                                    @if (canDecide() && po.status === 'requested') {
                                        <button
                                            pButton
                                            text
                                            severity="danger"
                                            label="Not now"
                                            [disabled]="busy()"
                                            (click)="reject(po)"></button>
                                        <button
                                            pButton
                                            label="Approve"
                                            icon="pi pi-check"
                                            [disabled]="busy()"
                                            (click)="decide(po, 'approved')"></button>
                                    } @else if (po.status === 'approved' || po.status === 'ordered') {
                                        @if (canDecide()) {
                                            <button
                                                pButton
                                                text
                                                label="Close it short"
                                                title="The rest is never coming"
                                                [disabled]="busy()"
                                                (click)="closeShort(po)"></button>
                                        }
                                        @if (canReceive()) {
                                            <button
                                                pButton
                                                outlined
                                                icon="pi pi-print"
                                                label="Print checklist"
                                                (click)="printChecklist(po)"></button>
                                        }
                                        @if (canDecide() && po.status === 'approved') {
                                            @if (canReceive()) {
                                                <button
                                                    pButton
                                                    outlined
                                                    icon="pi pi-truck"
                                                    label="Receive"
                                                    (click)="receive(po)"></button>
                                            }
                                            <button
                                                pButton
                                                label="Mark as ordered"
                                                icon="pi pi-send"
                                                [disabled]="busy()"
                                                (click)="markOrdered(po)"></button>
                                        } @else if (canReceive()) {
                                            <button
                                                pButton
                                                icon="pi pi-truck"
                                                label="Receive delivery"
                                                (click)="receive(po)"></button>
                                        }
                                    }
                                </div>
                            </div>
                        }
                    </div>
                }
            }

            <app-paginator [page]="pageInfo()" (pageChange)="onPageChange($event)" />
        </div>

        <!-- New purchase order ---------------------------------------------
             The order somebody places it in on the phone: who you are calling,
             what they bring and how much of each, then a last look before it
             goes. -->
        <p-drawer
            [visible]="raising()"
            (visibleChange)="onRaiseVisible($event)"
            position="right"
            header="New purchase order"
            styleClass="!w-full sm:!w-[42rem]">
            <div class="space-y-5">
                <app-steps
                    [steps]="raiseSteps"
                    [index]="raiseStep()"
                    label="New purchase order"
                    (indexChange)="goToStep($event)" />

                @if (formError()) {
                    <div class="app-note app-note--error">{{ formError() }}</div>
                }

                <!-- ── 1. Supplier ──────────────────────────────────────── -->
                @if (raiseStep() === 0) {
                    @if (pendingShortfall().length > 0) {
                        <div class="app-note app-note--warn">
                            The store was short on a request. Pick who to buy it from and the
                            shortfall will be filled in.
                        </div>
                    }
                    @if (suppliers().length === 0) {
                        <p class="text-sm text-surface-500">
                            {{ catalogueLoaded() ? 'No suppliers are set up yet. The admin adds them under Setup.' : 'Loading…' }}
                        </p>
                    } @else {
                        <ul class="rounded-xl border border-surface divide-y divide-surface overflow-hidden">
                            @for (s of suppliers(); track s.id) {
                                <li>
                                    <button
                                        type="button"
                                        class="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-50 dark:hover:bg-surface-800"
                                        [class.bg-primary-50]="supplierId() === s.id"
                                        [class.dark:bg-primary-950]="supplierId() === s.id"
                                        [attr.aria-pressed]="supplierId() === s.id"
                                        (click)="chooseSupplier(s.id)">
                                        <span class="min-w-0">
                                            <span class="block font-medium">{{ s.name }}</span>
                                            @if (s.phone) {
                                                <span class="block text-xs text-surface-500">{{ s.phone }}</span>
                                            }
                                        </span>
                                        @if (supplierId() === s.id) {
                                            <i class="pi pi-check text-primary" aria-hidden="true"></i>
                                        } @else {
                                            <i class="pi pi-chevron-right text-surface-400" aria-hidden="true"></i>
                                        }
                                    </button>
                                </li>
                            }
                        </ul>
                    }
                }

                <!-- ── 2. Products and how many ─────────────────────────── -->
                @if (raiseStep() === 1) {
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="text-sm">
                            <span class="font-semibold">{{ supplierName() }}</span>
                            <span class="text-surface-500"> · {{ onListCount() }} on their list</span>
                        </div>
                        @if (canSuggest()) {
                            <button
                                pButton
                                size="small"
                                [outlined]="!showLow()"
                                icon="pi pi-exclamation-triangle"
                                [label]="showLow() ? 'Showing what is running low' : 'What is running low?'"
                                (click)="toggleLow()"></button>
                        }
                    </div>

                    @if (showLow()) {
                        <div class="app-note app-note--warn flex flex-wrap items-center justify-between gap-2">
                            @if (!suggestionsLoaded()) {
                                <span>Checking the store…</span>
                            } @else if (lowKeys().size === 0) {
                                <span>Nothing from {{ supplierName() }} is below its reorder point.</span>
                            } @else {
                                <span>
                                    {{ lowKeys().size }} of their products below the reorder point.
                                </span>
                                <button
                                    pButton
                                    size="small"
                                    outlined
                                    label="Fill in suggested amounts"
                                    (click)="fillSuggested()"></button>
                            }
                        </div>
                    }

                    @if (rows().length > 8) {
                        <input
                            pInputText
                            class="w-full"
                            placeholder="Find in this list"
                            [ngModel]="rowFilter()"
                            (ngModelChange)="rowFilter.set($event)" />
                    }

                    @if (rows().length === 0) {
                        <p class="text-sm text-surface-500">
                            {{
                                loadingSupplierItems()
                                    ? 'Loading what they deliver…'
                                    : 'Nothing is on file for this supplier yet. Add what you need below - it will be remembered for next time.'
                            }}
                        </p>
                    } @else {
                        <ul class="rounded-xl border border-surface divide-y divide-surface">
                            @for (row of shownRows(); track row.key) {
                                <li class="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                                    <div class="min-w-0 flex-1">
                                        <div class="text-sm font-medium">
                                            {{ row.name }}
                                            @if (row.isNew) {
                                                <p-tag
                                                    severity="info"
                                                    value="new for this supplier"
                                                    styleClass="ml-1 !text-[10px]"></p-tag>
                                            }
                                        </div>
                                        <div class="text-xs text-surface-500">
                                            @if (lowFor(row); as low) {
                                                <span class="text-orange-600">
                                                    {{ q(low.inStore, low.stockUnit) }} left · reorder at
                                                    {{ q(low.reorderPoint, low.stockUnit) }}
                                                    · suggest {{ low.suggestedPacks }}
                                                </span>
                                            } @else if (row.itemId === null) {
                                                not a stock item
                                            } @else if (row.code) {
                                                {{ row.code }}
                                            }
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <input
                                            pInputText
                                            class="w-20 text-right"
                                            inputmode="decimal"
                                            placeholder="0"
                                            [attr.aria-label]="'How many ' + row.name"
                                            [ngModel]="row.qty"
                                            (ngModelChange)="setQty(row.key, $event)" />
                                        @if (row.itemId === null) {
                                            <span class="text-sm text-surface-500 w-32 truncate">
                                                {{ row.unit || 'each' }}
                                            </span>
                                        } @else if (packsFor(row).length > 1) {
                                            <select
                                                class="w-32 px-2 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm"
                                                [attr.aria-label]="'Pack for ' + row.name"
                                                [ngModel]="row.packId"
                                                (ngModelChange)="setPack(row.key, +$event)">
                                                @for (p of packsFor(row); track p.id) {
                                                    <option [ngValue]="p.id">{{ p.packName }}</option>
                                                }
                                            </select>
                                        } @else {
                                            <span class="text-sm text-surface-500 w-32 truncate">
                                                × {{ packName(row) }}
                                            </span>
                                        }
                                        @if (row.isNew) {
                                            <button
                                                pButton
                                                size="small"
                                                text
                                                severity="danger"
                                                icon="pi pi-times"
                                                [attr.aria-label]="'Take ' + row.name + ' off'"
                                                (click)="removeRow(row.key)"></button>
                                        } @else {
                                            <!-- Keeps the quantity boxes in one column. -->
                                            <span class="w-8" aria-hidden="true"></span>
                                        }
                                    </div>
                                </li>
                            } @empty {
                                <li class="px-4 py-3 text-sm text-surface-500">Nothing matches.</li>
                            }
                        </ul>
                    }

                    <!-- Not on their list. Either from the item master, or typed
                         in by name; either way it stays on their list. -->
                    <div class="rounded-xl border border-dashed border-surface p-4 space-y-4">
                        <div class="text-sm font-medium">Need something not on their list?</div>
                        <app-item-picker
                            label="From the item list"
                            placeholder="Type a product name or code"
                            [items]="notOnList()"
                            [value]="null"
                            (valueChange)="addItem($event)" />

                        <div>
                            <div class="text-sm font-medium mb-1">Not in the item list? Type it in</div>
                            <div class="flex flex-wrap items-end gap-2">
                                <input
                                    pInputText
                                    class="flex-1 min-w-40"
                                    placeholder="e.g. Gas regulator"
                                    aria-label="Product name"
                                    [ngModel]="newName()"
                                    (ngModelChange)="newName.set($event)" />
                                <input
                                    pInputText
                                    class="w-28"
                                    placeholder="unit, e.g. box"
                                    aria-label="Unit"
                                    [ngModel]="newUnit()"
                                    (ngModelChange)="newUnit.set($event)" />
                                <button
                                    pButton
                                    outlined
                                    icon="pi pi-plus"
                                    label="Add"
                                    [disabled]="newName().trim().length < 2"
                                    (click)="addNamed()"></button>
                            </div>
                            <p class="text-xs text-surface-500 mt-1">
                                Ordered by name only. It is not stock, so it will not go through a
                                delivery note when it arrives.
                            </p>
                        </div>
                    </div>
                }

                <!-- ── 3. Check and confirm ─────────────────────────────── -->
                @if (raiseStep() === 2) {
                    <div class="rounded-xl border border-surface overflow-hidden">
                        <div
                            class="px-4 py-2 border-b border-surface text-xs font-semibold text-surface-500">
                            Ordering from {{ supplierName() }}
                        </div>
                        <ul class="divide-y divide-surface">
                            @for (row of onOrder(); track row.key) {
                                <li
                                    class="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                                    <span class="min-w-0">
                                        {{ row.name }}
                                        @if (row.isNew) {
                                            <span class="text-xs text-primary"> · added to their list</span>
                                        }
                                    </span>
                                    <span class="font-medium text-right">
                                        {{ lineText(row) }}
                                        @if (row.itemId !== null) {
                                            <span class="block text-xs text-surface-500 font-normal">
                                                {{ baseText(row) }}
                                            </span>
                                        }
                                    </span>
                                </li>
                            }
                        </ul>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium mb-1" for="po-needed">
                                Needed by
                            </label>
                            <input
                                id="po-needed"
                                pInputText
                                class="w-full"
                                type="date"
                                [ngModel]="neededBy()"
                                (ngModelChange)="neededBy.set($event)" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1" for="po-reason">
                                Note
                                <span class="text-surface-500 font-normal">- optional</span>
                            </label>
                            <input
                                id="po-reason"
                                pInputText
                                class="w-full"
                                [placeholder]="byManagement() ? 'e.g. weekly order' : 'e.g. down to two sacks, Saturday is busy'"
                                [ngModel]="reason()"
                                (ngModelChange)="reason.set($event)" />
                        </div>
                    </div>

                    <div class="app-note" [class.app-note--ok]="byManagement()" [class.app-note--warn]="!byManagement()">
                        @if (byManagement()) {
                            You are management, so this order is approved as soon as you place it.
                            Mark it as ordered once it has gone to {{ supplierName() }}.
                        } @else {
                            This goes to management to approve before it is ordered.
                        }
                    </div>
                }

                <!-- ── Moving between steps ─────────────────────────────── -->
                <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                        pButton
                        text
                        [label]="raiseStep() === 0 ? 'Cancel' : 'Back'"
                        [icon]="raiseStep() === 0 ? '' : 'pi pi-arrow-left'"
                        (click)="raiseBack()"></button>

                    <div class="flex items-center gap-3">
                        @if (raiseBlocker(); as why) {
                            <span class="text-sm text-surface-500">{{ why }}</span>
                        }
                        @if (raiseStep() === 2) {
                            <button
                                pButton
                                icon="pi pi-check"
                                [label]="byManagement() ? 'Place order' : 'Send to management'"
                                [disabled]="raiseBlocker() !== null || busy()"
                                [loading]="busy()"
                                (click)="submitRaise()"></button>
                        } @else {
                            <button
                                pButton
                                label="Next"
                                icon="pi pi-arrow-right"
                                iconPos="right"
                                [disabled]="raiseBlocker() !== null"
                                (click)="raiseNext()"></button>
                        }
                    </div>
                </div>
            </div>
        </p-drawer>
    `
})
export class PurchasesComponent implements OnInit {
    readonly auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    readonly orders = signal<PurchaseOrder[]>([]);
    readonly pageInfo = signal<Page<PurchaseOrder>>(emptyPage<PurchaseOrder>());
    readonly pageReq = signal<PageRequest>({ page: 1, limit: DEFAULT_PAGE_SIZE });
    readonly ctx = signal<MyContext | null>(null);
    readonly loading = signal(true);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);
    readonly formError = signal<string | null>(null);
    readonly filter = signal<string>('requested');

    /** Section logins start on their own; management sees the branch. */
    readonly mine = signal(true);

    readonly raising = signal(false);

    /** Which of the three questions is on screen. */
    readonly raiseStep = signal(0);

    readonly raiseSteps: Step[] = [
        { key: 'supplier', label: 'Supplier', hint: 'Who is this order going to?' },
        {
            key: 'products',
            label: 'Products',
            hint: 'How many of each, in packs. Leave the rest empty.'
        },
        { key: 'confirm', label: 'Confirm', hint: 'A last look before it goes.' }
    ];

    /** Set when this order was opened from a request the store fell short on. */
    private readonly fromIssue = signal<string | null>(null);
    /** What that request was short of, waiting for a supplier to be picked. */
    readonly pendingShortfall = signal<{ itemId: number; shortBase: number }[]>([]);

    readonly items = signal<Item[]>([]);
    readonly suppliers = signal<Supplier[]>([]);
    readonly catalogueLoaded = signal(false);

    readonly supplierId = signal(0);
    readonly loadingSupplierItems = signal(false);
    readonly rows = signal<OrderRow[]>([]);
    readonly rowFilter = signal('');
    readonly newName = signal('');
    readonly newUnit = signal('');

    /** Low-stock hints: hidden until somebody asks for them. */
    readonly showLow = signal(false);
    readonly suggested = signal<SuggestedOrderLine[]>([]);
    readonly suggestionsLoaded = signal(false);

    readonly neededBy = signal('');
    readonly reason = signal('');

    readonly ownerOptions: FilterOption<boolean>[] = [
        { value: true, label: 'Mine' },
        { value: false, label: "Everyone's" }
    ];

    /** How many orders sit in each status, for the counts on the tabs. */
    readonly counts = signal({ requested: 0, approved: 0, ordered: 0 });

    readonly filterOptions = computed<FilterOption<string>[]>(() => {
        const c = this.counts();
        const n = (k: number) => (k > 0 ? ` (${k})` : '');
        return [
            {
                value: 'requested',
                label: (this.canDecide() ? 'To approve' : 'Waiting for approval') + n(c.requested)
            },
            { value: 'approved', label: 'Approved' + n(c.approved) },
            { value: 'ordered', label: 'On order' + n(c.ordered) },
            { value: 'done', label: 'Delivered' },
            { value: '', label: 'All' }
        ];
    });

    readonly search = signal('');
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    /** Orders showing every line rather than the first few. */
    readonly expanded = signal<ReadonlySet<string>>(new Set());
    readonly LINES_SHOWN = 4;

    readonly canDecide = computed(() => this.ctx()?.canDecidePurchases ?? false);

    /**
     * The storekeeper and management: the people who watch the store's shelf,
     * and the only two the server lets raise an order at all.
     */
    readonly canRaise = computed(() => {
        const role = this.auth.role();
        return role === 'management' || role === 'storekeeper';
    });

    /** Management's orders skip approval - they are the ones who give it. */
    readonly byManagement = computed(() => this.auth.role() === 'management');

    readonly canSuggest = computed(() => this.canRaise());

    readonly canReceive = computed(() => this.canRaise());

    /** Filtered by the server, so the pager under the list counts the same set. */
    readonly visible = computed(() => this.orders());

    readonly supplierName = computed(
        () => this.suppliers().find((s) => s.id === this.supplierId())?.name ?? ''
    );

    /** Already on the supplier's list, not counting what was added just now. */
    readonly onListCount = computed(() => this.rows().filter((r) => !r.isNew).length);

    /** What is actually on the order: every row with a quantity. */
    readonly onOrder = computed(() => this.rows().filter((r) => (r.qty ?? 0) > 0));

    /** Low-stock lines for this supplier's items, by row key. */
    readonly lowKeys = computed(() => {
        const ids = new Set(this.rows().map((r) => r.itemId));
        return new Map<string, SuggestedOrderLine>(
            this.suggested()
                .filter((s) => ids.has(s.itemId))
                .map((s) => [`i${s.itemId}`, s])
        );
    });

    readonly shownRows = computed(() => {
        const needle = this.rowFilter().trim().toLowerCase();
        let rows = this.rows();
        if (needle) {
            rows = rows.filter(
                (r) =>
                    r.name.toLowerCase().includes(needle) ||
                    (r.code ?? '').toLowerCase().includes(needle)
            );
        }
        // Asked to see what is low: put it first, where it gets looked at.
        if (this.showLow()) {
            const low = this.lowKeys();
            rows = [...rows].sort((a, b) => Number(low.has(b.key)) - Number(low.has(a.key)));
        }
        return rows;
    });

    /** The item master, less what is already a row here. */
    readonly notOnList = computed(() => {
        const taken = new Set(this.rows().map((r) => r.itemId));
        return this.items().filter((i) => !taken.has(i.id) && i.packs.length > 0);
    });

    /** Why the next button is not available, in the words of what is missing. */
    readonly raiseBlocker = computed<string | null>(() => {
        if (this.raiseStep() === 0) {
            return this.supplierId() ? null : 'Pick a supplier';
        }
        if (this.onOrder().length === 0) return 'Put a quantity against something';
        return null;
    });

    async ngOnInit(): Promise<void> {
        try {
            this.ctx.set(await this.api.myContext());
        } catch {
            /* the list still renders */
        }
        if (this.canDecide()) this.mine.set(false);
        await this.loadCounts();
        // Open on the first tab with something in it: what needs approving,
        // then what needs placing, then what is on its way.
        const c = this.counts();
        const first =
            c.requested > 0 ? 'requested' : c.approved > 0 ? 'approved' : c.ordered > 0 ? 'ordered' : '';
        this.filter.set(first);
        await this.load();

        // Sent here from a release the store could not cover.
        const issueId = this.route.snapshot.queryParamMap.get('issue');
        if (issueId && this.canRaise()) await this.openForShortfall(issueId);
    }

    onPageChange(e: PageChange): void {
        this.pageReq.set(e);
        void this.load();
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            const page = await this.api.listPurchaseOrders({
                ...this.pageReq(),
                status: this.filter() || undefined,
                mine: this.mine() && !this.canDecide() ? true : undefined,
                search: this.search().trim() || undefined
            });
            this.pageInfo.set(page);
            this.orders.set(page.items);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    /** The numbers on the tabs. One cheap query each, counting the whole set. */
    async loadCounts(): Promise<void> {
        const base = {
            limit: 1,
            mine: this.mine() && !this.canDecide() ? true : undefined,
            search: this.search().trim() || undefined
        };
        try {
            const [requested, approved, ordered] = await Promise.all([
                this.api.listPurchaseOrders({ ...base, status: 'requested' }),
                this.api.listPurchaseOrders({ ...base, status: 'approved' }),
                this.api.listPurchaseOrders({ ...base, status: 'ordered' })
            ]);
            this.counts.set({
                requested: requested.total,
                approved: approved.total,
                ordered: ordered.total
            });
        } catch {
            /* the list still works without the numbers */
        }
    }

    /** Re-read the list and the numbers after anything changes an order. */
    private async refresh(): Promise<void> {
        await Promise.all([this.load(), this.loadCounts()]);
    }

    /**
     * Searching looks everywhere. Somebody typing an order number wants that
     * order whatever its status, not "no match" because it sits under another
     * tab - so a search switches to All, and the tab counts say where it is.
     */
    onSearch(value: string, now = false): void {
        if (value.trim() && !this.search().trim()) this.filter.set('');
        this.search.set(value);
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(
            () => {
                this.pageReq.update((q) => ({ ...q, page: 1 }));
                void this.refresh();
            },
            now ? 0 : 250
        );
    }

    setMine(on: boolean): void {
        if (this.mine() === on) return;
        this.mine.set(on);
        this.pageReq.update((q) => ({ ...q, page: 1 }));
        void this.refresh();
    }

    setFilter(f: string): void {
        if (this.filter() === f) return;
        this.filter.set(f);
        // Filtering is done by the server, so the click has to refetch.
        this.pageReq.update((q) => ({ ...q, page: 1 }));
        void this.load();
    }

    // ── Raising ─────────────────────────────────────────────────────────────

    async openRaise(): Promise<void> {
        this.resetRaise();
        this.raising.set(true);
        await this.loadCatalogue();
    }

    /**
     * The same panel, opened from a request the store could not cover.
     *
     * The storekeeper releases what is on the shelf, sees what was short, and
     * lands here. They still pick who to buy it from first; the shortfall is
     * filled in once they have. The order carries the request's id, so the
     * two stay tied together.
     */
    private async openForShortfall(issueId: string): Promise<void> {
        this.resetRaise();
        this.raising.set(true);
        await this.loadCatalogue();

        // Drop the parameter. Otherwise a refresh - or the tab strip restoring
        // this tab tomorrow - reopens a drawer about a request long dealt with.
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {},
            replaceUrl: true
        });

        try {
            const detail = await this.api.getRequest(issueId);
            const short = detail.lines
                .map((line) => ({
                    itemId: line.itemId,
                    shortBase: line.qtyRequested - (line.qtyIssued ?? 0)
                }))
                .filter((s) => s.shortBase > 0);

            if (short.length === 0) {
                this.formError.set('Nothing was short on that request.');
                return;
            }
            this.pendingShortfall.set(short);
            this.fromIssue.set(issueId);
            this.reason.set('The store could not cover a request');
        } catch (err) {
            this.formError.set(apiErrorMessage(err));
        }
    }

    private resetRaise(): void {
        this.formError.set(null);
        this.raiseStep.set(0);
        // A prefill opened and then closed must not quietly tie the next,
        // unrelated order to that request.
        this.fromIssue.set(null);
        this.pendingShortfall.set([]);
        this.supplierId.set(0);
        this.rows.set([]);
        this.rowFilter.set('');
        this.newName.set('');
        this.newUnit.set('');
        this.showLow.set(false);
        this.neededBy.set('');
        this.reason.set('');
    }

    private async loadCatalogue(): Promise<void> {
        if (this.catalogueLoaded()) return;
        try {
            const [items, suppliers] = await Promise.all([
                this.api.listItems(),
                this.api.listSuppliers()
            ]);
            this.items.set(items);
            this.suppliers.set(suppliers);
            this.catalogueLoaded.set(true);
        } catch (err) {
            this.formError.set(apiErrorMessage(err));
        }
    }

    private async loadSuggestions(): Promise<void> {
        if (!this.canSuggest() || this.suggestionsLoaded()) return;
        try {
            this.suggested.set(await this.api.suggestedOrder());
            this.suggestionsLoaded.set(true);
        } catch (err) {
            this.formError.set(apiErrorMessage(err));
        }
    }

    /** Picking a supplier loads what they deliver and moves on to it. */
    async chooseSupplier(id: number): Promise<void> {
        if (this.supplierId() !== id) {
            const hasQty = this.onOrder().length > 0;
            if (hasQty) {
                const ok = await this.notify.confirm(
                    'The quantities you have typed are for the other supplier and will be cleared.',
                    'Change supplier?',
                    'Change'
                );
                if (!ok) return;
            }
            this.supplierId.set(id);
            this.rows.set([]);
            this.rowFilter.set('');
            await this.loadSupplierItems(id);
            this.applyShortfall();
        }
        this.raiseStep.set(1);
    }

    private async loadSupplierItems(supplierId: number): Promise<void> {
        this.loadingSupplierItems.set(true);
        this.formError.set(null);
        try {
            const list = await this.api.supplierItems(supplierId);
            // A different supplier picked while this one was loading.
            if (this.supplierId() !== supplierId) return;
            this.rows.set(
                list
                    .map((s) => this.rowFrom(s))
                    .filter((r): r is OrderRow => r !== null)
            );
        } catch (err) {
            this.formError.set(apiErrorMessage(err));
        } finally {
            this.loadingSupplierItems.set(false);
        }
    }

    private rowFrom(s: SupplierItem): OrderRow | null {
        if (s.itemId === null) {
            return {
                key: `n${s.name.toLowerCase()}`,
                itemId: null,
                name: s.name,
                code: null,
                unit: s.unit,
                packId: null,
                qty: null,
                isNew: false
            };
        }
        const item = this.items().find((i) => i.id === s.itemId);
        const pack = item ? this.defaultPack(item) : null;
        // No pack means there is no way to say how much to buy.
        if (!item || !pack) return null;
        return {
            key: `i${item.id}`,
            itemId: item.id,
            name: item.name,
            code: item.code,
            unit: item.stockUnit,
            packId: pack.id,
            qty: null,
            isNew: false
        };
    }

    /** The request's shortfall, in whole packs, against this supplier's rows. */
    private applyShortfall(): void {
        for (const { itemId, shortBase } of this.pendingShortfall()) {
            const item = this.items().find((i) => i.id === itemId);
            const pack = item ? this.defaultPack(item) : null;
            if (!item || !pack) {
                this.notify.warning(
                    `${item?.name ?? 'An item'} has no pack size set up, so there is no way to say how much to buy.`
                );
                continue;
            }
            // Rounded up: you buy whole packs, and buying one short leaves the
            // section short again tomorrow.
            const packs = Math.max(1, Math.ceil(shortBase / pack.qtyInStockUnit));
            if (!this.rows().some((r) => r.itemId === itemId)) this.addItem(itemId);
            this.rows.update((rows) =>
                rows.map((r) => (r.itemId === itemId ? { ...r, packId: pack.id, qty: packs } : r))
            );
        }
    }

    /** What this item is normally bought in - the pack an order is placed in. */
    defaultPack(item: Item): ItemPack | null {
        return item.packs.find((p) => p.isDefaultPurchase) ?? item.packs[0] ?? null;
    }

    packsFor(row: OrderRow): ItemPack[] {
        return this.items().find((i) => i.id === row.itemId)?.packs ?? [];
    }

    packName(row: OrderRow): string {
        return this.packsFor(row).find((p) => p.id === row.packId)?.packName ?? 'pack';
    }

    lowFor(row: OrderRow): SuggestedOrderLine | null {
        return this.showLow() ? (this.lowKeys().get(row.key) ?? null) : null;
    }

    async toggleLow(): Promise<void> {
        const next = !this.showLow();
        this.showLow.set(next);
        if (next) await this.loadSuggestions();
    }

    /** Suggested packs into every low row that has no quantity yet. */
    fillSuggested(): void {
        const low = this.lowKeys();
        this.rows.update((rows) =>
            rows.map((r) => {
                const s = low.get(r.key);
                if (!s || (r.qty ?? 0) > 0 || s.suggestedPacks <= 0) return r;
                // The suggestion is in the default pack; switch to it.
                return { ...r, packId: s.itemPackId ?? r.packId, qty: s.suggestedPacks };
            })
        );
    }

    setQty(key: string, value: string | number | null): void {
        const text = String(value ?? '').trim();
        const parsed = text === '' ? null : Number(text);
        if (parsed !== null && (isNaN(parsed) || parsed < 0)) return;
        this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, qty: parsed } : r)));
    }

    setPack(key: string, packId: number): void {
        this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, packId } : r)));
    }

    /** From the item master: on this order, and on their list from now on. */
    addItem(itemId: number | null): void {
        if (itemId === null) return;
        const item = this.items().find((i) => i.id === itemId);
        const pack = item ? this.defaultPack(item) : null;
        if (!item || !pack) return;
        if (this.rows().some((r) => r.itemId === itemId)) return;
        this.rows.update((rows) => [
            {
                key: `i${item.id}`,
                itemId: item.id,
                name: item.name,
                code: item.code,
                unit: item.stockUnit,
                packId: pack.id,
                qty: 1,
                isNew: true
            },
            ...rows
        ]);
    }

    /** A product the item master does not have, by name. */
    addNamed(): void {
        const name = this.newName().trim();
        if (name.length < 2) return;
        const key = `n${name.toLowerCase()}`;
        if (this.rows().some((r) => r.key === key)) {
            this.notify.warning(`${name} is already on the list.`);
            return;
        }
        this.rows.update((rows) => [
            {
                key,
                itemId: null,
                name,
                code: null,
                unit: this.newUnit().trim() || null,
                packId: null,
                qty: 1,
                isNew: true
            },
            ...rows
        ]);
        this.newName.set('');
        this.newUnit.set('');
    }

    /** Only something added this time; their list is the admin's to change. */
    removeRow(key: string): void {
        this.rows.update((rows) => rows.filter((r) => r.key !== key));
    }

    goToStep(index: number): void {
        // Forward only through the Next button, which checks each step.
        if (index < this.raiseStep()) this.raiseStep.set(index);
    }

    raiseNext(): void {
        if (this.raiseBlocker() !== null) return;
        this.raiseStep.update((i) => Math.min(i + 1, this.raiseSteps.length - 1));
    }

    raiseBack(): void {
        if (this.raiseStep() === 0) {
            this.raising.set(false);
            return;
        }
        this.raiseStep.update((i) => i - 1);
    }

    onRaiseVisible(visible: boolean): void {
        this.raising.set(visible);
        if (!visible) this.raiseStep.set(0);
    }

    lineText(row: OrderRow): string {
        if (row.itemId === null) return `${row.qty} ${row.unit || 'each'}`;
        return `${row.qty} × ${this.packName(row)}`;
    }

    baseText(row: OrderRow): string {
        const pack = this.packsFor(row).find((p) => p.id === row.packId);
        if (!pack || row.unit === null) return '';
        return '= ' + formatQty((row.qty ?? 0) * pack.qtyInStockUnit, row.unit);
    }

    async submitRaise(): Promise<void> {
        const lines = this.onOrder();
        if (lines.length === 0 || !this.supplierId()) return;
        this.busy.set(true);
        this.formError.set(null);
        try {
            const result = await this.api.raisePurchaseOrder({
                issueId: this.fromIssue(),
                supplierId: this.supplierId(),
                neededBy: this.neededBy() || null,
                reason: this.reason().trim() || null,
                lines: lines.map((r) =>
                    r.itemId === null
                        ? { name: r.name, unit: r.unit, qty: r.qty! }
                        : { itemPackId: r.packId!, qtyPacks: r.qty! }
                )
            });
            this.notify.success(
                result.status === 'approved'
                    ? `Order for ${this.supplierName()} placed`
                    : 'Sent to management'
            );
            this.raising.set(false);
            this.resetRaise();
            // Show it where it now sits, rather than a filter it is not in.
            this.filter.set(result.status);
            this.pageReq.update((q) => ({ ...q, page: 1 }));
            await this.refresh();
        } catch (err) {
            this.formError.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    // ── Deciding ────────────────────────────────────────────────────────────

    /** Turning an order down says why, so whoever raised it knows. */
    async reject(po: PurchaseOrder): Promise<void> {
        const note = await this.notify.prompt(
            `Order no. ${po.id} for ${po.supplierName ?? 'this supplier'} will not be bought. Say why, so ${po.raisedBy} knows - or leave it blank.`,
            'Not now?',
            '',
            'Not now'
        );
        if (note === null) return;
        await this.decide(po, 'rejected', note.trim() || null);
    }

    async decide(po: PurchaseOrder, decision: PoDecision, note: string | null = null): Promise<void> {
        this.busy.set(true);
        try {
            await this.api.decidePurchaseOrder(po.id, decision, note);
            this.notify.success(
                decision === 'rejected'
                    ? 'Marked as not now'
                    : decision === 'done'
                      ? 'Marked delivered'
                      : `Marked ${decision}`
            );
            await this.refresh();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    /**
     * Ordered means placed with somebody. Every new order has its supplier
     * already; only orders raised before that was required can lack one.
     */
    async markOrdered(po: PurchaseOrder): Promise<void> {
        let supplierId = po.supplierId;

        if (!supplierId) {
            await this.loadCatalogue();
            const names = this.suppliers()
                .map((s, i) => `${i + 1}. ${s.name}`)
                .join('\n');
            const answer = await this.notify.prompt(
                `Type the number of the supplier:\n${names}`,
                'Who is it being ordered from?',
                '',
                'Mark as ordered'
            );
            if (!answer) return;
            const picked = this.suppliers()[Number(answer.trim()) - 1];
            if (!picked) {
                this.notify.error('That was not one of the numbers on the list');
                return;
            }
            supplierId = picked.id;
        }

        this.busy.set(true);
        try {
            await this.api.decidePurchaseOrder(po.id, 'ordered', null, supplierId);
            this.notify.success('Marked as ordered - receive it when it arrives');
            await this.refresh();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async closeShort(po: PurchaseOrder): Promise<void> {
        const note = await this.notify.prompt(
            'The rest is not coming. Say why, because in six weeks somebody will ask.',
            'Close this order short',
            '',
            'Close it'
        );
        if (!note || note.trim().length < 3) return;
        this.busy.set(true);
        try {
            await this.api.closePurchaseOrder(po.id, note.trim());
            this.notify.success('Closed');
            await this.refresh();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    /** The order on paper, to tick off by hand at the door. */
    printChecklist(po: PurchaseOrder): void {
        openPrint('/expected-deliveries/print', { po: po.id });
    }

    /** Receiving is a delivery, so it happens on the delivery screen. */
    receive(po: PurchaseOrder): void {
        void this.router.navigate(['/grn'], { queryParams: { po: po.id } });
    }

    /** One item is not coming: off the order, with a reason. */
    async voidLine(po: PurchaseOrder, line: PurchaseOrderLine): Promise<void> {
        const reason = await this.notify.prompt(
            `${line.name} will be taken off this order. What it was ordered for stays on record. Why is it not coming?`,
            'Void this item',
            '',
            'Void it'
        );
        if (reason === null) return;
        if (reason.trim().length < 3) {
            this.notify.warning('Give a short reason.');
            return;
        }
        this.busy.set(true);
        try {
            const res = await this.api.voidPoLine(po.id, line.id, reason.trim());
            this.notify.success(
                res.orderComplete
                    ? `${line.name} voided. Nothing else is outstanding - the order is closed.`
                    : `${line.name} taken off the order`
            );
            await this.refresh();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    // ── Display ─────────────────────────────────────────────────────────────

    ordered(line: PurchaseOrderLine): string {
        if (!line.isStockItem) return `${line.qtyPacks ?? line.qtyBase} ${line.stockUnit || 'each'}`;
        if (line.qtyPacks === null || !line.packName) {
            return formatQty(line.qtyBase, line.stockUnit ?? '');
        }
        return `${line.qtyPacks} × ${line.packName}`;
    }

    // ── Reading an order at a glance ────────────────────────────────────────

    /** An order the person looking at it is the next step on. */
    needsMe(po: PurchaseOrder): boolean {
        if (po.status === 'requested') return this.canDecide();
        if (po.status === 'approved') return this.canDecide();
        if (po.status === 'ordered') return this.canReceive();
        return false;
    }

    private isOpen(po: PurchaseOrder): boolean {
        return po.status === 'requested' || po.status === 'approved' || po.status === 'ordered';
    }

    isLate(po: PurchaseOrder): boolean {
        if (!po.neededBy || !this.isOpen(po)) return false;
        return po.neededBy < new Date().toISOString().slice(0, 10);
    }

    /** "Needed by Fri 4 Oct · in 3 days" / "· 2 days late" */
    dueText(po: PurchaseOrder): string {
        if (!po.neededBy) return '';
        const due = new Date(po.neededBy + 'T00:00:00');
        const label = due.toLocaleDateString('en-LK', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        if (!this.isOpen(po)) return `Needed by ${label}`;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
        const when =
            days === 0
                ? 'today'
                : days === 1
                  ? 'tomorrow'
                  : days > 1
                    ? `in ${days} days`
                    : `${-days} day${days === -1 ? '' : 's'} late`;
        return `Needed by ${label} · ${when}`;
    }

    showsProgress(po: PurchaseOrder): boolean {
        return po.status === 'ordered' || (po.status === 'approved' && po.partReceived) || po.status === 'done';
    }

    activeLines(po: PurchaseOrder): number {
        return po.lines.filter((l) => !l.voided).length;
    }

    arrived(po: PurchaseOrder): number {
        return po.lines.filter((l) => !l.voided && l.qtyOutstandingBase === 0).length;
    }

    voidedCount(po: PurchaseOrder): number {
        return po.lines.filter((l) => l.voided).length;
    }

    shownLines(po: PurchaseOrder): PurchaseOrderLine[] {
        return this.expanded().has(po.id) ? po.lines : po.lines.slice(0, this.LINES_SHOWN);
    }

    toggleLines(id: string): void {
        this.expanded.update((set) => {
            const next = new Set(set);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    lineState(line: PurchaseOrderLine): 'in' | 'part' | 'waiting' | 'void' {
        if (line.voided) return 'void';
        if (line.qtyOutstandingBase === 0) return 'in';
        return line.qtyReceivedBase > 0 ? 'part' : 'waiting';
    }

    lineProgress(line: PurchaseOrderLine): string {
        if (line.qtyOutstandingBase === 0) {
            return line.qtyCreditedBase > 0 ? 'done - part credited' : 'all delivered';
        }
        if (line.qtyReceivedBase === 0) return 'nothing in yet';
        return `${this.q(line.qtyReceivedBase, line.stockUnit)} in · ${this.q(line.qtyOutstandingBase, line.stockUnit)} still to come`;
    }

    /**
     * Closing short is the only way a finished order gets a note - it needs a
     * reason - so a note on a done order means it was closed, not approved.
     */
    decidedText(po: PurchaseOrder): string {
        if (po.status === 'rejected') return 'Turned down';
        if (po.status === 'done' && po.decisionNote) return 'Closed short';
        return 'Approved';
    }

    /** One line saying what has to happen next, and by whom. */
    nextStep(po: PurchaseOrder): string | null {
        switch (po.status) {
            case 'requested':
                return this.canDecide()
                    ? 'Check it, then approve it or turn it down.'
                    : 'Waiting for management to approve it.';
            case 'approved':
                return this.canDecide()
                    ? `Place it with ${po.supplierName ?? 'the supplier'}, then mark it as ordered.`
                    : 'Approved - receive it when the lorry comes.';
            case 'ordered':
                return po.partReceived
                    ? 'Part delivered - receive the rest when it comes.'
                    : 'On its way - receive it when the lorry comes.';
            default:
                return null;
        }
    }

    emptyText(): string {
        switch (this.filter()) {
            case 'requested':
                return this.canDecide() ? 'Nothing waiting for your approval.' : 'Nothing waiting for approval.';
            case 'approved':
                return 'Nothing approved and waiting to be ordered.';
            case 'ordered':
                return 'Nothing on its way right now.';
            case 'done':
                return 'Nothing delivered yet.';
            default:
                return 'No purchase orders yet.';
        }
    }

    label(status: string): string {
        return (
            {
                requested: this.canDecide() ? 'To approve' : 'Waiting for approval',
                approved: 'Approved',
                rejected: 'Not now',
                ordered: 'On order',
                done: 'Delivered'
            }[status] ?? status
        );
    }

    tone(status: string): 'success' | 'warn' | 'info' | 'danger' | 'secondary' {
        return status === 'approved' || status === 'done'
            ? 'success'
            : status === 'rejected'
              ? 'danger'
              : status === 'ordered'
                ? 'info'
                : 'warn';
    }

    day(iso: string): string {
        return new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' });
    }

    q(qty: number, unit: string | null): string {
        return formatQty(qty, unit ?? '');
    }
}
