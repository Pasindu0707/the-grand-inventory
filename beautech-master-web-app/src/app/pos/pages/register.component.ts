/** POS Register — product grid + cart + payment (FRONTEND_DOCUMENTATION.md §2.3 Register). */
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { liveQuery, Subscription as DexieSub } from 'dexie';
import { db } from '../core/pos-database';
import { CartStore } from '../stores/cart.store';
import { AuthStore } from '../stores/auth.store';
import { formatMoney, lineGross, lineTotal } from '../core/money';
import { PaginationComponent } from '../components/pagination.component';
import { PaymentModalComponent } from '../components/payment-modal.component';
import { ReceiptOverlayComponent } from '../components/receipt-overlay.component';
import { BarcodeScannerDirective } from '../core/barcode-scanner.directive';
import { NotifyService } from '../core/notify.service';
import type { CartLine, CheckoutReceipt, LocalCategory, LocalCustomer, LocalDiscount, LocalProduct } from '../core/types';

@Component({
    selector: 'pos-register',
    standalone: true,
    imports: [CommonModule, FormsModule, PaginationComponent, PaymentModalComponent, ReceiptOverlayComponent, BarcodeScannerDirective],
    template: `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4" posBarcodeScanner (scan)="onScan($event)">
            <!-- LEFT: product selection -->
            <div class="lg:col-span-2 flex flex-col gap-3">
                <div class="flex gap-2 overflow-x-auto pb-1">
                    <button type="button" class="px-3 py-1.5 rounded-full text-sm whitespace-nowrap border"
                        [class.bg-primary]="activeCategory() === null" [class.text-primary-contrast]="activeCategory() === null"
                        [class.border-primary]="activeCategory() === null" [class.border-surface]="activeCategory() !== null"
                        (click)="setCategory(null)">All</button>
                    <button type="button" *ngFor="let c of categories()" class="px-3 py-1.5 rounded-full text-sm whitespace-nowrap border"
                        [class.bg-primary]="activeCategory() === c.id" [class.text-primary-contrast]="activeCategory() === c.id"
                        [class.border-primary]="activeCategory() === c.id" [class.border-surface]="activeCategory() !== c.id"
                        (click)="setCategory(c.id)">{{ c.name }}</button>
                </div>

                <input [(ngModel)]="search" (ngModelChange)="onSearch()" placeholder="Search products or SKU…"
                    class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" />

                <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    <button type="button" *ngFor="let p of pagedProducts()" (click)="add(p)"
                        class="text-left rounded-xl border border-surface bg-surface-0 dark:bg-surface-900 p-3 hover:border-primary transition">
                        <div class="font-medium text-sm truncate">{{ p.name }}</div>
                        <div class="text-xs text-muted-color">{{ p.sku }}</div>
                        <div class="mt-2 flex items-center justify-between">
                            <span class="font-semibold">{{ money(p.price) }}</span>
                            <span class="text-[11px] px-2 py-0.5 rounded-full"
                                [class.bg-rose-100]="p.stock_qty <= p.low_stock_threshold" [class.text-rose-600]="p.stock_qty <= p.low_stock_threshold"
                                [class.bg-emerald-100]="p.stock_qty > p.low_stock_threshold" [class.text-emerald-600]="p.stock_qty > p.low_stock_threshold">
                                {{ p.stock_qty }}
                            </span>
                        </div>
                    </button>
                </div>
                <p *ngIf="filteredProducts().length === 0" class="text-center text-muted-color py-8">No products. Pull catalog or add inventory.</p>

                <pos-pagination [page]="page()" [pageSize]="pageSize" [total]="filteredProducts().length"
                    (change)="page.set($event.page)"></pos-pagination>
            </div>

            <!-- RIGHT: cart -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 flex flex-col gap-3 h-fit lg:sticky lg:top-4">
                <div class="flex items-center justify-between">
                    <h2 class="font-bold">Cart ({{ cart.count() }})</h2>
                    <button type="button" class="text-sm text-rose-500" (click)="clear()">Clear</button>
                </div>

                <!-- Customer picker -->
                <div class="relative">
                    <input [(ngModel)]="customerSearch" (ngModelChange)="custDropdown.set(true)" (focus)="custDropdown.set(true)"
                        [placeholder]="cart.customer()?.name || 'Walk-in customer'"
                        class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                    <div *ngIf="custDropdown() && filteredCustomers().length" class="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 shadow">
                        <button type="button" class="block w-full text-left px-3 py-2 text-sm hover:bg-surface-100 dark:hover:bg-surface-800" (click)="pickCustomer(null)">Walk-in customer</button>
                        <button type="button" *ngFor="let c of filteredCustomers()" class="block w-full text-left px-3 py-2 text-sm hover:bg-surface-100 dark:hover:bg-surface-800" (click)="pickCustomer(c)">
                            {{ c.name }} <span class="text-muted-color">· {{ c.loyalty_points }} pts</span>
                        </button>
                    </div>
                </div>

                <!-- Lines -->
                <div class="flex flex-col gap-2 max-h-80 overflow-auto">
                    <div *ngFor="let l of cart.lines()" class="rounded-lg bg-surface-50 dark:bg-surface-800 p-2">
                        <div class="flex justify-between text-sm">
                            <span class="font-medium truncate">{{ l.name }}</span>
                            <button type="button" class="text-rose-500" (click)="cart.removeLine(l.lineId)">✕</button>
                        </div>
                        <div class="flex items-center justify-between mt-1">
                            <div class="flex items-center gap-2">
                                <button type="button" class="h-6 w-6 rounded bg-surface-200 dark:bg-surface-700" (click)="cart.decrement(l.lineId)">−</button>
                                <span class="text-sm w-6 text-center">{{ l.qty }}</span>
                                <button type="button" class="h-6 w-6 rounded bg-surface-200 dark:bg-surface-700" (click)="cart.increment(l.lineId)">+</button>
                            </div>
                            <span class="text-sm font-semibold">{{ money(lineTotal(l)) }}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[11px] text-muted-color">Disc</span>
                            <input type="number" min="0" class="w-20 px-2 py-1 text-xs rounded border border-surface bg-surface-0 dark:bg-surface-900"
                                [ngModel]="l.discountSnapshot" (ngModelChange)="setLineDiscount(l.lineId, $event)" />
                            <span class="text-[11px] text-muted-color">of {{ money(lineGross(l)) }}</span>
                        </div>
                    </div>
                    <p *ngIf="!cart.lines().length" class="text-center text-muted-color text-sm py-6">Cart is empty</p>
                </div>

                <!-- Bill discount -->
                <select [ngModel]="cart.billDiscount()?.discountId || ''" (ngModelChange)="pickBillDiscount($event)"
                    class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm">
                    <option value="">No bill discount</option>
                    <option *ngFor="let d of billDiscounts()" [value]="d.id">{{ d.name }} ({{ d.type === 'PERCENT' ? d.value + '%' : money(d.value) }})</option>
                </select>

                <!-- Totals -->
                <div class="border-t border-surface pt-2 text-sm flex flex-col gap-1">
                    <div class="flex justify-between text-muted-color"><span>Subtotal</span><span>{{ money(cart.totals().subtotal) }}</span></div>
                    <div class="flex justify-between text-muted-color"><span>Discount</span><span>-{{ money(cart.totals().discountTotal) }}</span></div>
                    <div class="flex justify-between text-muted-color"><span>Tax</span><span>{{ money(cart.totals().taxTotal) }}</span></div>
                    <div class="flex justify-between font-bold text-base"><span>Total</span><span>{{ money(cart.totals().total) }}</span></div>
                </div>

                <button type="button" class="w-full py-2.5 rounded-lg bg-primary text-primary-contrast font-medium disabled:opacity-50"
                    [disabled]="!cart.lines().length" (click)="openPayment()">Charge {{ money(cart.totals().total) }}</button>
            </div>
        </div>

        <pos-payment-modal [open]="paymentOpen()" [cart]="cart.effectiveLines()" [totals]="cart.totals()" [customer]="cart.customer()"
            (complete)="onPaid($event)" (close)="paymentOpen.set(false)"></pos-payment-modal>

        <pos-receipt-overlay *ngIf="receipt()" [receipt]="receipt()!" [productNames]="productNames()"
            [cashierName]="cashierName" [customerName]="cart.customer()?.name || ''" (close)="dismissReceipt()"></pos-receipt-overlay>
    `
})
export class RegisterComponent implements OnInit, OnDestroy {
    cart = inject(CartStore);
    private auth = inject(AuthStore);
    private notify = inject(NotifyService);

    products = signal<LocalProduct[]>([]);
    categories = signal<LocalCategory[]>([]);
    customers = signal<LocalCustomer[]>([]);
    billDiscounts = signal<LocalDiscount[]>([]);

    activeCategory = signal<string | null>(null);
    search = '';
    private searchTerm = signal('');
    page = signal(1);
    pageSize = 12;

    customerSearch = '';
    custDropdown = signal(false);

    paymentOpen = signal(false);
    receipt = signal<CheckoutReceipt | null>(null);

    private subs: DexieSub[] = [];

    get cashierName(): string {
        return this.auth.user()?.fullName ?? '';
    }

    filteredProducts = computed(() => {
        const term = this.searchTerm().toLowerCase().trim();
        const cat = this.activeCategory();
        return this.products()
            .filter((p) => p.is_active === 1)
            .filter((p) => (cat ? p.category_id === cat : true))
            .filter((p) => (term ? p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) : true));
    });

    pagedProducts = computed(() => {
        const start = (this.page() - 1) * this.pageSize;
        return this.filteredProducts().slice(start, start + this.pageSize);
    });

    filteredCustomers = computed(() => {
        const term = this.customerSearch.toLowerCase().trim();
        if (!term) return this.customers().slice(0, 8);
        return this.customers()
            .filter((c) => c.name.toLowerCase().includes(term) || (c.email ?? '').toLowerCase().includes(term) || (c.phone ?? '').includes(term))
            .slice(0, 8);
    });

    productNames = computed(() => {
        const map: Record<string, string> = {};
        for (const p of this.products()) map[p.id] = p.name;
        return map;
    });

    ngOnInit(): void {
        this.subs.push(liveQuery(() => db.products.toArray()).subscribe((p) => this.products.set(p)));
        this.subs.push(liveQuery(() => db.categories.toArray()).subscribe((c) => this.categories.set(c)));
        this.subs.push(liveQuery(() => db.customers.toArray()).subscribe((c) => this.customers.set(c)));
        this.subs.push(
            liveQuery(() => db.discounts.where('scope').equals('BILL').toArray()).subscribe((d) =>
                this.billDiscounts.set(d.filter((x) => x.is_active === 1))
            )
        );
    }

    ngOnDestroy(): void {
        this.subs.forEach((s) => s.unsubscribe());
    }

    money = (n: number) => formatMoney(n);
    lineTotal = (l: CartLine) => lineTotal(l);
    lineGross = (l: CartLine) => lineGross(l);

    setCategory(id: string | null): void {
        this.activeCategory.set(id);
        this.page.set(1);
    }
    onSearch(): void {
        this.searchTerm.set(this.search);
        this.page.set(1);
    }

    add(p: LocalProduct): void {
        if (p.stock_qty <= 0) {
            this.notify.warning(`${p.name} is out of stock`);
        }
        this.cart.addProduct(p);
    }

    onScan(e: { code: string; matched: boolean }): void {
        if (!e.matched) this.notify.warning(`No product for barcode ${e.code}`);
    }

    setLineDiscount(lineId: string, amount: number): void {
        this.cart.setLineDiscount(lineId, Number(amount) || 0);
    }

    pickCustomer(c: LocalCustomer | null): void {
        this.cart.setCustomer(c);
        this.customerSearch = '';
        this.custDropdown.set(false);
    }

    pickBillDiscount(id: string): void {
        if (!id) {
            this.cart.setBillDiscount(null);
            return;
        }
        const d = this.billDiscounts().find((x) => x.id === id);
        if (d) this.cart.setBillDiscount({ discountId: d.id, name: d.name, type: d.type, value: d.value });
    }

    clear(): void {
        this.cart.clear();
    }

    openPayment(): void {
        if (!this.cart.lines().length) return;
        this.paymentOpen.set(true);
    }

    onPaid(receipt: CheckoutReceipt): void {
        this.paymentOpen.set(false);
        this.receipt.set(receipt);
        this.notify.success('Payment complete');
        this.cart.clear();
    }

    dismissReceipt(): void {
        this.receipt.set(null);
    }
}
