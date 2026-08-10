/** Reporting dashboard with charts + tables (FRONTEND_DOCUMENTATION.md §2.3 Reports). */
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartModule } from 'primeng/chart';
import { ReportingService } from '../services/reporting.service';
import { formatMoney } from '../core/money';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type {
    BranchSalesRow,
    DailySalesReport,
    LocationStockRow,
    PaymentMethodRow,
    ShiftSummary,
    TaxLiabilityRow,
    TopSkuRow
} from '../core/types';

@Component({
    selector: 'pos-reports',
    standalone: true,
    imports: [CommonModule, FormsModule, ChartModule],
    template: `
        <div class="flex flex-col gap-4">
            <div class="flex items-end gap-3 flex-wrap">
                <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Day</span><input type="date" [(ngModel)]="date" (ngModelChange)="loadDaily()" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">From</span><input type="date" [(ngModel)]="from" (ngModelChange)="loadRange()" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">To</span><input type="date" [(ngModel)]="to" (ngModelChange)="loadRange()" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
            </div>

            <!-- KPIs -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Total sales</div><div class="text-2xl font-bold">{{ money(daily()?.totalSales || 0) }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Transactions</div><div class="text-2xl font-bold">{{ daily()?.transactionCount || 0 }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Avg ticket</div><div class="text-2xl font-bold">{{ money(daily()?.averageTicket || 0) }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Tax collected</div><div class="text-2xl font-bold">{{ money(daily()?.taxCollected || 0) }}</div></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><div class="text-xs text-muted-color">Net revenue</div><div class="text-2xl font-bold">{{ money(daily()?.netRevenue || 0) }}</div></div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><h3 class="font-bold mb-3">Tax liability</h3><p-chart type="line" [data]="taxChart()" [options]="chartOptions" height="260px"></p-chart></div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4"><h3 class="font-bold mb-3">Top SKUs</h3><p-chart type="bar" [data]="skuChart()" [options]="chartOptions" height="260px"></p-chart></div>
            </div>

            <!-- Tables -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                    <h3 class="font-bold mb-3">Sales by branch</h3>
                    <table class="w-full text-sm"><thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Branch</th><th class="text-right">Txns</th><th class="text-right">Total</th></tr></thead>
                    <tbody><tr *ngFor="let b of branchSales()" class="border-b border-surface/50"><td class="py-2">{{ b.branchName }}</td><td class="text-right">{{ b.count }}</td><td class="text-right">{{ money(b.total) }}</td></tr>
                    <tr *ngIf="!branchSales().length"><td colspan="3" class="text-center text-muted-color py-4">No data</td></tr></tbody></table>
                </div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                    <h3 class="font-bold mb-3">Payment methods</h3>
                    <table class="w-full text-sm"><thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Method</th><th class="text-right">Count</th><th class="text-right">Total</th></tr></thead>
                    <tbody><tr *ngFor="let p of payments()" class="border-b border-surface/50"><td class="py-2">{{ p.method }}</td><td class="text-right">{{ p.count }}</td><td class="text-right">{{ money(p.total) }}</td></tr>
                    <tr *ngIf="!payments().length"><td colspan="3" class="text-center text-muted-color py-4">No data</td></tr></tbody></table>
                </div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                    <h3 class="font-bold mb-3">Stock by location</h3>
                    <table class="w-full text-sm"><thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Location</th><th class="text-right">Products</th><th class="text-right">Units</th></tr></thead>
                    <tbody><tr *ngFor="let s of stockByLocation()" class="border-b border-surface/50"><td class="py-2">{{ s.locationName }}</td><td class="text-right">{{ s.productCount }}</td><td class="text-right">{{ s.totalUnits }}</td></tr>
                    <tr *ngIf="!stockByLocation().length"><td colspan="3" class="text-center text-muted-color py-4">No data</td></tr></tbody></table>
                </div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                    <h3 class="font-bold mb-3">Shift summaries</h3>
                    <table class="w-full text-sm"><thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Employee</th><th class="text-right">Txns</th><th class="text-right">Sales</th></tr></thead>
                    <tbody><tr *ngFor="let s of shifts()" class="border-b border-surface/50"><td class="py-2">{{ s.employeeName }}</td><td class="text-right">{{ s.transactionCount }}</td><td class="text-right">{{ money(s.salesTotal) }}</td></tr>
                    <tr *ngIf="!shifts().length"><td colspan="3" class="text-center text-muted-color py-4">No data</td></tr></tbody></table>
                </div>
            </div>

            <!-- Top SKUs detail -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                <h3 class="font-bold mb-3">Top SKUs detail</h3>
                <table class="w-full text-sm"><thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">SKU</th><th>Name</th><th class="text-right">Units</th><th class="text-right">Revenue</th></tr></thead>
                <tbody><tr *ngFor="let t of topSkus()" class="border-b border-surface/50"><td class="py-2 font-mono text-xs">{{ t.sku }}</td><td>{{ t.name }}</td><td class="text-right">{{ t.unitsSold }}</td><td class="text-right">{{ money(t.revenue) }}</td></tr>
                <tr *ngIf="!topSkus().length"><td colspan="4" class="text-center text-muted-color py-4">No data</td></tr></tbody></table>
            </div>
        </div>
    `
})
export class ReportsComponent implements OnInit {
    private service = inject(ReportingService);
    private notify = inject(NotifyService);

    date = new Date().toISOString().slice(0, 10);
    from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    to = new Date().toISOString().slice(0, 10);

    daily = signal<DailySalesReport | null>(null);
    tax = signal<TaxLiabilityRow[]>([]);
    topSkus = signal<TopSkuRow[]>([]);
    branchSales = signal<BranchSalesRow[]>([]);
    payments = signal<PaymentMethodRow[]>([]);
    stockByLocation = signal<LocationStockRow[]>([]);
    shifts = signal<ShiftSummary[]>([]);

    chartOptions = {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    };

    money = (n: number) => formatMoney(n);

    taxChart = computed(() => ({
        labels: this.tax().map((r) => r.date),
        datasets: [{ label: 'Tax', data: this.tax().map((r) => r.amount), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.15)', tension: 0.3, fill: true }]
    }));

    skuChart = computed(() => ({
        labels: this.topSkus().slice(0, 8).map((r) => r.name),
        datasets: [{ label: 'Units', data: this.topSkus().slice(0, 8).map((r) => r.unitsSold), backgroundColor: '#10b981' }]
    }));

    ngOnInit(): void {
        this.loadDaily();
        this.loadRange();
    }

    async loadDaily(): Promise<void> {
        try {
            this.daily.set(await this.service.dailySales(this.date));
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async loadRange(): Promise<void> {
        const params = { from: this.from, to: this.to };
        try {
            const [tax, top, branch, pay, stock, shifts] = await Promise.all([
                this.service.taxLiabilities(params).catch(() => []),
                this.service.topSkus(params).catch(() => []),
                this.service.salesByBranch(params).catch(() => []),
                this.service.paymentMethods(params).catch(() => []),
                this.service.stockByLocation().catch(() => []),
                this.service.shiftSummaries(params).catch(() => [])
            ]);
            this.tax.set(tax ?? []);
            this.topSkus.set(top ?? []);
            this.branchSales.set(branch ?? []);
            this.payments.set(pay ?? []);
            this.stockByLocation.set(stock ?? []);
            this.shifts.set(shifts ?? []);
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
