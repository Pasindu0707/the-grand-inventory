/** Gift card lifecycle (FRONTEND_DOCUMENTATION.md §2.3 GiftCards). */
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GiftCardsService } from '../services/gift-cards.service';
import { formatMoney } from '../core/money';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { GiftCard } from '../core/types';

@Component({
    selector: 'pos-gift-cards',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-4">
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                    <div class="text-xs text-muted-color">Active cards</div>
                    <div class="text-3xl font-bold">{{ activeCount() }}</div>
                </div>
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                    <div class="text-xs text-muted-color">Outstanding balance</div>
                    <div class="text-3xl font-bold">{{ money(outstanding()) }}</div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Code</th><th class="text-right">Balance</th><th>Status</th><th>Issued</th><th class="text-right">Actions</th></tr></thead>
                        <tbody>
                            <tr *ngFor="let g of cards()" class="border-b border-surface/50">
                                <td class="py-2 font-mono text-xs">••••{{ g.code.slice(-4) }}</td>
                                <td class="text-right">{{ money(g.balance) }}</td>
                                <td><span class="text-[11px] px-2 py-0.5 rounded-full" [class.bg-emerald-100]="g.isActive" [class.text-emerald-600]="g.isActive" [class.bg-surface-200]="!g.isActive">{{ g.isActive ? 'Active' : 'Inactive' }}</span></td>
                                <td>{{ g.issuedAt | date }}</td>
                                <td class="text-right whitespace-nowrap">
                                    <button type="button" class="text-primary text-xs mr-3" (click)="openTopUp(g)">Top-up</button>
                                    <button type="button" *ngIf="g.isActive" class="text-rose-500 text-xs" (click)="deactivate(g)">Deactivate</button>
                                </td>
                            </tr>
                            <tr *ngIf="!cards().length"><td colspan="5" class="text-center text-muted-color py-6">No gift cards</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                    <h3 class="font-bold mb-3">Issue gift card</h3>
                    <form (ngSubmit)="issue()" class="flex flex-col gap-3">
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Amount</span><input required type="number" min="1" step="0.01" [(ngModel)]="amount" name="amount" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                        <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Code (optional)</span><input [(ngModel)]="code" name="code" placeholder="Auto-generated" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                        <button type="submit" class="py-2 rounded-lg bg-primary text-primary-contrast text-sm" [disabled]="busy()">Issue</button>
                    </form>
                </div>
            </div>
        </div>

        <!-- Top-up modal -->
        <div *ngIf="topUpCard()" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" (click)="topUpCard.set(null)">
            <div class="rounded-2xl bg-surface-0 dark:bg-surface-900 p-6 w-full max-w-sm" (click)="$event.stopPropagation()">
                <h3 class="font-bold mb-3">Top-up card ••••{{ topUpCard()!.code.slice(-4) }}</h3>
                <input type="number" min="1" step="0.01" [(ngModel)]="topUpAmount" class="w-full px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 mb-4" placeholder="Amount" />
                <div class="flex justify-end gap-2">
                    <button type="button" class="px-4 py-2 rounded-lg border border-surface" (click)="topUpCard.set(null)">Cancel</button>
                    <button type="button" class="px-4 py-2 rounded-lg bg-primary text-primary-contrast" (click)="topUp()">Apply</button>
                </div>
            </div>
        </div>
    `
})
export class GiftCardsComponent implements OnInit {
    private service = inject(GiftCardsService);
    private notify = inject(NotifyService);

    cards = signal<GiftCard[]>([]);
    amount = 0;
    code = '';
    busy = signal(false);
    topUpCard = signal<GiftCard | null>(null);
    topUpAmount = 0;

    money = (n: number) => formatMoney(n);
    activeCount = computed(() => this.cards().filter((c) => c.isActive).length);
    outstanding = computed(() => this.cards().filter((c) => c.isActive).reduce((s, c) => s + c.balance, 0));

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        try {
            this.cards.set(await this.service.listGiftCards());
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async issue(): Promise<void> {
        if (this.amount <= 0) return;
        this.busy.set(true);
        try {
            await this.service.issueGiftCard({ amount: this.amount, code: this.code || undefined });
            this.notify.success('Gift card issued');
            this.amount = 0;
            this.code = '';
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }

    openTopUp(g: GiftCard): void {
        this.topUpCard.set(g);
        this.topUpAmount = 0;
    }

    async topUp(): Promise<void> {
        const g = this.topUpCard();
        if (!g || this.topUpAmount <= 0) return;
        try {
            await this.service.topUpGiftCard(g.id, this.topUpAmount);
            this.notify.success('Gift card topped up');
            this.topUpCard.set(null);
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async deactivate(g: GiftCard): Promise<void> {
        if (!(await this.notify.confirm('Deactivate this gift card?', 'Deactivate'))) return;
        try {
            await this.service.deactivateGiftCard(g.id);
            this.notify.success('Gift card deactivated');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
