/** Discounts table + form (FRONTEND_DOCUMENTATION.md §2.3 Discounts). */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiscountsService, DiscountInput } from '../services/discounts.service';
import { formatMoney } from '../core/money';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { ApiDiscount } from '../core/types';

@Component({
    selector: 'pos-discounts',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Name</th><th>Type</th><th class="text-right">Value</th><th>Scope</th><th>Active</th><th class="text-right">Actions</th></tr></thead>
                    <tbody>
                        <tr *ngFor="let d of discounts()" class="border-b border-surface/50">
                            <td class="py-2 font-medium">{{ d.name }}</td>
                            <td>{{ d.type }}</td>
                            <td class="text-right">{{ d.type === 'PERCENT' ? d.value + '%' : money(d.value) }}</td>
                            <td>{{ d.scope }}</td>
                            <td><span class="text-[11px] px-2 py-0.5 rounded-full" [class.bg-emerald-100]="d.isActive" [class.text-emerald-600]="d.isActive" [class.bg-surface-200]="!d.isActive">{{ d.isActive ? 'Yes' : 'No' }}</span></td>
                            <td class="text-right whitespace-nowrap"><button type="button" class="text-primary text-xs mr-3" (click)="edit(d)">Edit</button><button type="button" class="text-rose-500 text-xs" (click)="remove(d)">Delete</button></td>
                        </tr>
                        <tr *ngIf="!discounts().length"><td colspan="6" class="text-center text-muted-color py-6">No discounts yet</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                <h3 class="font-bold mb-3">{{ editingId ? 'Edit' : 'New' }} discount</h3>
                <form (ngSubmit)="save()" class="flex flex-col gap-3">
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Name</span><input required [(ngModel)]="form.name" name="name" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Type</span><select [(ngModel)]="form.type" name="type" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option value="PERCENT">Percent</option><option value="FIXED">Fixed</option></select></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Value</span><input required type="number" step="0.01" [(ngModel)]="form.value" name="value" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Scope</span><select [(ngModel)]="form.scope" name="scope" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option value="PRODUCT">Product</option><option value="BILL">Bill</option></select></label>
                    <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="form.isActive" name="active" /> Active</label>
                    <div class="flex gap-2">
                        <button type="submit" class="flex-1 py-2 rounded-lg bg-primary text-primary-contrast text-sm" [disabled]="busy()">Save</button>
                        <button type="button" *ngIf="editingId" class="px-4 py-2 rounded-lg border border-surface text-sm" (click)="reset()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `
})
export class DiscountsComponent implements OnInit {
    private service = inject(DiscountsService);
    private notify = inject(NotifyService);

    discounts = signal<ApiDiscount[]>([]);
    editingId: string | null = null;
    busy = signal(false);
    form: DiscountInput = this.empty();

    money = (n: number) => formatMoney(n);

    ngOnInit(): void {
        this.load();
    }

    private empty(): DiscountInput {
        return { name: '', type: 'PERCENT', value: 0, scope: 'PRODUCT', isActive: true };
    }

    async load(): Promise<void> {
        try {
            this.discounts.set(await this.service.listDiscounts());
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    edit(d: ApiDiscount): void {
        this.editingId = d.id;
        this.form = { name: d.name, type: d.type, value: d.value, scope: d.scope, isActive: d.isActive };
    }

    reset(): void {
        this.editingId = null;
        this.form = this.empty();
    }

    async save(): Promise<void> {
        this.busy.set(true);
        try {
            if (this.editingId) await this.service.updateDiscount(this.editingId, this.form);
            else await this.service.createDiscount(this.form);
            this.notify.success('Discount saved');
            this.reset();
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }

    async remove(d: ApiDiscount): Promise<void> {
        if (!(await this.notify.confirm(`Delete ${d.name}?`, 'Delete discount'))) return;
        try {
            await this.service.deleteDiscount(d.id);
            this.notify.success('Discount deleted');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
