/** Inventory: product CRUD + restock (FRONTEND_DOCUMENTATION.md §2.3 Inventory). */
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutService } from '@/layout/service/layout.service';
import { CatalogService, ProductInput } from '../services/catalog.service';
import { formatMoney } from '../core/money';
import { PaginationComponent } from '../components/pagination.component';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { ApiCategory, ApiDiscount, ApiProduct, InventoryReason } from '../core/types';
import { DiscountsService } from '../services/discounts.service';

@Component({
    selector: 'pos-inventory',
    standalone: true,
    imports: [CommonModule, FormsModule, PaginationComponent],
    template: `
        <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex gap-2 overflow-x-auto">
                    <button type="button" class="px-3 py-1.5 rounded-full text-sm border" [class.bg-primary]="cat() === null" [class.text-primary-contrast]="cat() === null"
                        [class.border-primary]="cat() === null" [class.border-surface]="cat() !== null" (click)="cat.set(null)">All</button>
                    <button type="button" *ngFor="let c of categories()" class="px-3 py-1.5 rounded-full text-sm border whitespace-nowrap"
                        [class.bg-primary]="cat() === c.id" [class.text-primary-contrast]="cat() === c.id" [class.border-primary]="cat() === c.id" [class.border-surface]="cat() !== c.id"
                        (click)="cat.set(c.id)">{{ c.name }}</button>
                </div>
                <div class="flex gap-2">
                    <button type="button" class="px-4 py-2 rounded-lg border border-surface text-sm" (click)="openCategories()">Categories</button>
                    <button type="button" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast text-sm" (click)="openForm()">+ Add product</button>
                </div>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-muted-color border-b border-surface">
                        <th class="py-2">SKU</th><th>Name</th><th class="text-right">Price</th><th class="text-right">Stock</th><th class="text-right">Tax</th><th>Status</th><th class="text-right">Actions</th></tr></thead>
                    <tbody>
                        <tr *ngFor="let p of paged()" class="border-b border-surface/50">
                            <td class="py-2 font-mono text-xs">{{ p.sku }}</td>
                            <td>{{ p.name }}</td>
                            <td class="text-right">{{ money(+p.price) }}</td>
                            <td class="text-right"><span class="px-2 py-0.5 rounded-full text-[11px]" [class.bg-rose-100]="p.stockQty <= p.lowStockThreshold" [class.text-rose-600]="p.stockQty <= p.lowStockThreshold" [class.bg-emerald-100]="p.stockQty > p.lowStockThreshold" [class.text-emerald-600]="p.stockQty > p.lowStockThreshold">{{ p.stockQty }}</span></td>
                            <td class="text-right">{{ (+p.taxRate * 100) | number: '1.0-2' }}%</td>
                            <td><span class="text-[11px] px-2 py-0.5 rounded-full" [class.bg-emerald-100]="p.isActive" [class.text-emerald-600]="p.isActive" [class.bg-surface-200]="!p.isActive">{{ p.isActive ? 'Active' : 'Inactive' }}</span></td>
                            <td class="text-right whitespace-nowrap">
                                <span class="inline-flex gap-2 justify-end">
                                    <button type="button" class="px-2.5 py-1 rounded-lg border border-surface text-primary text-xs hover:bg-primary/10 transition" (click)="openForm(p)">Edit</button>
                                    <button type="button" class="px-2.5 py-1 rounded-lg border border-surface text-amber-600 text-xs hover:bg-amber-500/10 transition" (click)="openRestock(p)">Restock</button>
                                </span>
                            </td>
                        </tr>
                        <tr *ngIf="!paged().length"><td colspan="7" class="text-center text-muted-color py-6">No products</td></tr>
                    </tbody>
                </table>
                <pos-pagination [page]="page()" [pageSize]="pageSize" [total]="filtered().length" (change)="page.set($event.page)"></pos-pagination>
            </div>
        </div>

        <!-- Product form -->
        <div *ngIf="formOpen()" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" (click)="formOpen.set(false)">
            <div class="rounded-2xl bg-surface-0 dark:bg-surface-900 p-6 w-full max-w-lg max-h-[90vh] overflow-auto" (click)="$event.stopPropagation()">
                <h3 class="font-bold mb-4">{{ editingId ? 'Edit' : 'Add' }} product</h3>
                <form (ngSubmit)="save()" class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">SKU</span><input required [(ngModel)]="form.sku" name="sku" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Name</span><input required [(ngModel)]="form.name" name="name" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Price</span><input required type="number" step="0.01" [(ngModel)]="form.price" name="price" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Tax rate (e.g. 0.08)</span><input type="number" step="0.0001" [(ngModel)]="form.taxRate" name="taxRate" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Cost price</span><input type="number" step="0.01" [(ngModel)]="form.costPrice" name="costPrice" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Low-stock threshold</span><input type="number" [(ngModel)]="form.lowStockThreshold" name="low" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Category</span>
                        <select [(ngModel)]="form.categoryId" name="cat" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option [ngValue]="null">None</option><option *ngFor="let c of categories()" [ngValue]="c.id">{{ c.name }}</option></select></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Discount</span>
                        <select [(ngModel)]="form.discountId" name="disc" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option [ngValue]="null">None</option><option *ngFor="let d of discounts()" [ngValue]="d.id">{{ d.name }}</option></select></label>
                    <div class="col-span-2 flex justify-end gap-2 mt-2">
                        <button type="button" class="px-4 py-2 rounded-lg border border-surface" (click)="formOpen.set(false)">Cancel</button>
                        <button type="submit" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast" [disabled]="busy()">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Categories -->
        <div *ngIf="categoriesOpen()" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" (click)="categoriesOpen.set(false)">
            <div class="rounded-2xl bg-surface-0 dark:bg-surface-900 p-6 w-full max-w-md" (click)="$event.stopPropagation()">
                <h3 class="font-bold mb-4">Categories</h3>
                <form (ngSubmit)="addCategory()" class="flex gap-2 mb-4">
                    <input required [(ngModel)]="newCategoryName" name="newCat" placeholder="New category name"
                        class="flex-1 px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                    <button type="submit" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast text-sm" [disabled]="catBusy()">Add</button>
                </form>
                <div class="flex flex-col gap-1 max-h-72 overflow-auto">
                    <div *ngFor="let c of categories()" class="flex items-center justify-between rounded-lg border border-surface px-3 py-2 text-sm">
                        <span>{{ c.name }}</span>
                        <button type="button" class="text-rose-500 text-xs" (click)="removeCategory(c)" [disabled]="catBusy()">Delete</button>
                    </div>
                    <p *ngIf="!categories().length" class="text-center text-muted-color py-6 text-sm">No categories yet</p>
                </div>
                <div class="flex justify-end mt-4">
                    <button type="button" class="px-4 py-2 rounded-lg border border-surface text-sm" (click)="categoriesOpen.set(false)">Close</button>
                </div>
            </div>
        </div>

        <!-- Restock -->
        <div *ngIf="restockOpen()" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" (click)="restockOpen.set(false)">
            <div class="rounded-2xl bg-surface-0 dark:bg-surface-900 p-6 w-full max-w-md" (click)="$event.stopPropagation()">
                <h3 class="font-bold mb-1">Restock</h3>
                <p class="text-sm text-muted-color mb-4">{{ restockProduct?.name }}</p>
                <form (ngSubmit)="saveRestock()" class="flex flex-col gap-3">
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Quantity (+/-)</span><input required type="number" [(ngModel)]="restockQty" name="qty" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Reason</span>
                        <select [(ngModel)]="restockReason" name="reason" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900">
                            <option value="RECEIVED">Received</option><option value="RECOUNT">Recount</option><option value="DAMAGED">Damaged</option><option value="RETURNED">Returned</option><option value="TRANSFER">Transfer</option></select></label>
                    <div class="flex justify-end gap-2">
                        <button type="button" class="px-4 py-2 rounded-lg border border-surface" (click)="restockOpen.set(false)">Cancel</button>
                        <button type="submit" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast">Apply</button>
                    </div>
                </form>
            </div>
        </div>
    `
})
export class InventoryComponent implements OnInit, OnDestroy {
    private catalog = inject(CatalogService);
    private discountsService = inject(DiscountsService);
    private notify = inject(NotifyService);
    private layout = inject(LayoutService);

    constructor() {
        // Dim the sidebar whenever any inventory modal is open (see styles.scss .layout-modal-open).
        effect(() => {
            this.layout.setAppModalOpen(this.formOpen() || this.restockOpen() || this.categoriesOpen());
        });
    }

    products = signal<ApiProduct[]>([]);
    categories = signal<ApiCategory[]>([]);
    discounts = signal<ApiDiscount[]>([]);
    cat = signal<string | null>(null);
    page = signal(1);
    pageSize = 15;
    busy = signal(false);

    formOpen = signal(false);
    editingId: string | null = null;
    form: ProductInput = this.emptyForm();

    restockOpen = signal(false);
    restockProduct: ApiProduct | null = null;
    restockQty = 0;
    restockReason: InventoryReason = 'RECEIVED';

    categoriesOpen = signal(false);
    newCategoryName = '';
    catBusy = signal(false);

    money = (n: number) => formatMoney(n);

    filtered = computed(() => {
        const c = this.cat();
        return this.products().filter((p) => (c ? p.categoryId === c : true));
    });
    paged = computed(() => {
        const start = (this.page() - 1) * this.pageSize;
        return this.filtered().slice(start, start + this.pageSize);
    });

    ngOnInit(): void {
        this.load();
    }

    ngOnDestroy(): void {
        this.layout.setAppModalOpen(false);
    }

    private emptyForm(): ProductInput {
        return { sku: '', name: '', price: 0, taxRate: 0, costPrice: null, lowStockThreshold: 0, categoryId: null, discountId: null };
    }

    async load(): Promise<void> {
        try {
            const [p, c, d] = await Promise.all([this.catalog.listProducts(), this.catalog.listCategories(), this.discountsService.listDiscounts()]);
            this.products.set(p ?? []);
            this.categories.set(c ?? []);
            this.discounts.set(d ?? []);
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    openForm(p?: ApiProduct): void {
        if (p) {
            this.editingId = p.id;
            this.form = {
                sku: p.sku, name: p.name, price: +p.price, taxRate: +p.taxRate,
                costPrice: p.costPrice != null ? +p.costPrice : null, lowStockThreshold: p.lowStockThreshold,
                categoryId: p.categoryId, discountId: p.discountId
            };
        } else {
            this.editingId = null;
            this.form = this.emptyForm();
        }
        this.formOpen.set(true);
    }

    async save(): Promise<void> {
        this.busy.set(true);
        try {
            if (this.editingId) await this.catalog.updateProduct(this.editingId, this.form);
            else await this.catalog.createProduct(this.form);
            await this.catalog.pullCatalog();
            this.notify.success('Product saved');
            this.formOpen.set(false);
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }

    openCategories(): void {
        this.newCategoryName = '';
        this.categoriesOpen.set(true);
    }

    async addCategory(): Promise<void> {
        const name = this.newCategoryName.trim();
        if (!name) return;
        this.catBusy.set(true);
        try {
            await this.catalog.createCategory(name);
            await this.catalog.pullCatalog();
            this.newCategoryName = '';
            this.notify.success('Category added');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.catBusy.set(false);
        }
    }

    async removeCategory(c: ApiCategory): Promise<void> {
        this.catBusy.set(true);
        try {
            await this.catalog.deleteCategory(c.id);
            await this.catalog.pullCatalog();
            if (this.cat() === c.id) this.cat.set(null);
            this.notify.success('Category deleted');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.catBusy.set(false);
        }
    }

    openRestock(p: ApiProduct): void {
        this.restockProduct = p;
        this.restockQty = 0;
        this.restockReason = 'RECEIVED';
        this.restockOpen.set(true);
    }

    async saveRestock(): Promise<void> {
        if (!this.restockProduct) return;
        try {
            await this.catalog.adjustStock(this.restockProduct.id, Number(this.restockQty), this.restockReason);
            await this.catalog.pullCatalog();
            this.notify.success('Stock adjusted');
            this.restockOpen.set(false);
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
