/** Multi-location stock + transfers (FRONTEND_DOCUMENTATION.md §2.3 Stock). */
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationsService } from '../services/locations.service';
import { CatalogService } from '../services/catalog.service';
import { PaginationComponent } from '../components/pagination.component';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { AuthBranch, InventoryReason, LocationStock, StockTransfer } from '../core/types';

@Component({
    selector: 'pos-stock',
    standalone: true,
    imports: [CommonModule, FormsModule, PaginationComponent],
    template: `
        <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <select [(ngModel)]="locationId" (ngModelChange)="loadStock()" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm">
                    <option *ngFor="let l of locations()" [ngValue]="l.id">{{ l.name }} ({{ l.type }})</option>
                </select>
                <div class="flex gap-2">
                    <button type="button" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast text-sm" (click)="addStockOpen.set(true)">+ Add stock</button>
                    <button type="button" class="px-4 py-2 rounded-lg border border-surface text-sm" (click)="openTransfer()">Transfer</button>
                </div>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                <h3 class="font-bold mb-3">Stock</h3>
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Product</th><th>SKU</th><th class="text-right">Qty</th><th>Status</th></tr></thead>
                    <tbody>
                        <tr *ngFor="let s of pagedStock()" class="border-b border-surface/50">
                            <td class="py-2 font-medium">{{ s.name }}</td>
                            <td class="font-mono text-xs">{{ s.sku }}</td>
                            <td class="text-right">{{ s.qty }}</td>
                            <td><span class="text-[11px] px-2 py-0.5 rounded-full" [class.bg-rose-100]="s.qty <= s.lowStockThreshold" [class.text-rose-600]="s.qty <= s.lowStockThreshold" [class.bg-emerald-100]="s.qty > s.lowStockThreshold" [class.text-emerald-600]="s.qty > s.lowStockThreshold">{{ s.qty <= s.lowStockThreshold ? 'Low' : 'OK' }}</span></td>
                        </tr>
                        <tr *ngIf="!stock().length"><td colspan="4" class="text-center text-muted-color py-6">No stock data</td></tr>
                    </tbody>
                </table>
                <pos-pagination [page]="stockPage()" [pageSize]="15" [total]="stock().length" (change)="stockPage.set($event.page)"></pos-pagination>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                <h3 class="font-bold mb-3">Transfer history</h3>
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Date</th><th>From</th><th>To</th><th class="text-right">Items</th></tr></thead>
                    <tbody>
                        <tr *ngFor="let t of pagedTransfers()" class="border-b border-surface/50">
                            <td class="py-2">{{ t.createdAt | date: 'short' }}</td>
                            <td>{{ t.sourceLocationName }}</td>
                            <td>{{ t.destinationLocationName }}</td>
                            <td class="text-right">{{ t.items.length }}</td>
                        </tr>
                        <tr *ngIf="!transfers().length"><td colspan="4" class="text-center text-muted-color py-6">No transfers</td></tr>
                    </tbody>
                </table>
                <pos-pagination [page]="transferPage()" [pageSize]="10" [total]="transfers().length" (change)="transferPage.set($event.page)"></pos-pagination>
            </div>
        </div>

        <!-- Add stock -->
        <div *ngIf="addStockOpen()" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" (click)="addStockOpen.set(false)">
            <div class="rounded-2xl bg-surface-0 dark:bg-surface-900 p-6 w-full max-w-md" (click)="$event.stopPropagation()">
                <h3 class="font-bold mb-3">Add stock</h3>
                <form (ngSubmit)="addStock()" class="flex flex-col gap-3">
                    <select required [(ngModel)]="addForm.productId" name="product" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option value="" disabled>Select product</option><option *ngFor="let p of stock()" [value]="p.productId">{{ p.name }}</option></select>
                    <input required type="number" [(ngModel)]="addForm.qty" name="qty" placeholder="Quantity" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" />
                    <select [(ngModel)]="addForm.reason" name="reason" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option value="RECEIVED">Received</option><option value="RECOUNT">Recount</option><option value="RETURNED">Returned</option></select>
                    <div class="flex justify-end gap-2"><button type="button" class="px-4 py-2 rounded-lg border border-surface" (click)="addStockOpen.set(false)">Cancel</button><button type="submit" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast">Add</button></div>
                </form>
            </div>
        </div>

        <!-- Transfer -->
        <div *ngIf="transferOpen()" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" (click)="transferOpen.set(false)">
            <div class="rounded-2xl bg-surface-0 dark:bg-surface-900 p-6 w-full max-w-lg max-h-[90vh] overflow-auto" (click)="$event.stopPropagation()">
                <h3 class="font-bold mb-3">Stock transfer</h3>
                <form (ngSubmit)="submitTransfer()" class="flex flex-col gap-3">
                    <div class="grid grid-cols-2 gap-3">
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">From</span><select [(ngModel)]="transferForm.sourceLocationId" name="src" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option *ngFor="let l of locations()" [value]="l.id">{{ l.name }}</option></select></label>
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">To</span><select [(ngModel)]="transferForm.destinationLocationId" name="dst" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option *ngFor="let l of locations()" [value]="l.id">{{ l.name }}</option></select></label>
                    </div>
                    <div class="flex flex-col gap-2 max-h-64 overflow-auto">
                        <div *ngFor="let s of stock()" class="flex items-center justify-between gap-2 text-sm">
                            <span class="truncate">{{ s.name }}</span>
                            <input type="number" min="0" [ngModel]="transferQty[s.productId] || 0" (ngModelChange)="transferQty[s.productId] = $event" [name]="'q_' + s.productId" class="w-24 px-2 py-1 rounded border border-surface bg-surface-0 dark:bg-surface-900" />
                        </div>
                    </div>
                    <div class="flex justify-end gap-2"><button type="button" class="px-4 py-2 rounded-lg border border-surface" (click)="transferOpen.set(false)">Cancel</button><button type="submit" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast">Transfer</button></div>
                </form>
            </div>
        </div>
    `
})
export class StockComponent implements OnInit {
    private locationsService = inject(LocationsService);
    private catalog = inject(CatalogService);
    private notify = inject(NotifyService);

    locations = signal<AuthBranch[]>([]);
    locationId = '';
    stock = signal<LocationStock[]>([]);
    transfers = signal<StockTransfer[]>([]);
    stockPage = signal(1);
    transferPage = signal(1);

    addStockOpen = signal(false);
    addForm = { productId: '', qty: 0, reason: 'RECEIVED' as InventoryReason };

    transferOpen = signal(false);
    transferForm = { sourceLocationId: '', destinationLocationId: '' };
    transferQty: Record<string, number> = {};

    pagedStock = computed(() => {
        const start = (this.stockPage() - 1) * 15;
        return this.stock().slice(start, start + 15);
    });
    pagedTransfers = computed(() => {
        const start = (this.transferPage() - 1) * 10;
        return this.transfers().slice(start, start + 10);
    });

    ngOnInit(): void {
        this.init();
    }

    async init(): Promise<void> {
        try {
            const locs = await this.locationsService.listLocations();
            this.locations.set(locs ?? []);
            if (locs?.length) {
                this.locationId = locs[0].id;
                this.transferForm.sourceLocationId = locs[0].id;
                this.transferForm.destinationLocationId = locs[1]?.id ?? locs[0].id;
                await this.loadStock();
            }
            await this.loadTransfers();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async loadStock(): Promise<void> {
        if (!this.locationId) return;
        try {
            this.stock.set(await this.locationsService.getLocationStock(this.locationId));
            this.stockPage.set(1);
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async loadTransfers(): Promise<void> {
        try {
            const res = await this.locationsService.listTransfers({ page: 1, pageSize: 50 });
            this.transfers.set(res.rows ?? []);
        } catch {
            this.transfers.set([]);
        }
    }

    async addStock(): Promise<void> {
        if (!this.addForm.productId) return;
        try {
            await this.locationsService.addStock(this.locationId, { ...this.addForm, qty: Number(this.addForm.qty) });
            this.notify.success('Stock added');
            this.addStockOpen.set(false);
            this.loadStock();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    openTransfer(): void {
        this.transferQty = {};
        this.transferOpen.set(true);
    }

    async submitTransfer(): Promise<void> {
        const items = Object.entries(this.transferQty)
            .filter(([, q]) => q > 0)
            .map(([productId, qty]) => ({ productId, qty: Number(qty) }));
        if (!items.length) {
            this.notify.warning('Add at least one item to transfer');
            return;
        }
        try {
            await this.locationsService.createTransfer({ ...this.transferForm, items });
            this.notify.success('Transfer created');
            this.transferOpen.set(false);
            this.loadTransfers();
            this.loadStock();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
