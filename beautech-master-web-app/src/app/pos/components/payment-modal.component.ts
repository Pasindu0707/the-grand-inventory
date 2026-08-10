/**
 * Split-tender payment modal (FRONTEND_DOCUMENTATION.md §2.1 PaymentModal).
 * 7 payment methods, gift card lookup, loyalty redemption, Stripe Terminal flow.
 */
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { formatMoney } from '../core/money';
import { AuthStore } from '../stores/auth.store';
import { CheckoutService } from '../services/checkout.service';
import { GiftCardsService } from '../services/gift-cards.service';
import { PaymentsService } from '../services/payments.service';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { CartLine, CartTotals, CheckoutReceipt, LocalCustomer, PaymentMethod, Tender } from '../core/types';

interface MethodMeta {
    method: PaymentMethod;
    label: string;
    icon: string;
    offline: boolean;
}

type TerminalStage = 'IDLE' | 'CREATING' | 'WAITING' | 'CONFIRMING' | 'DONE' | 'ERROR';

@Component({
    selector: 'pos-payment-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, DialogModule, InputNumberModule],
    template: `
        <p-dialog
            [visible]="open"
            (visibleChange)="onVisibleChange($event)"
            [modal]="true"
            [style]="{ width: '40rem' }"
            header="Take Payment"
            [draggable]="false"
            [resizable]="false">
            <div class="flex flex-col gap-4">
                <!-- Totals -->
                <div class="rounded-xl bg-surface-100 dark:bg-surface-800 p-4">
                    <div class="flex justify-between text-sm"><span>Total due</span><span class="font-bold text-lg">{{ money(totals.total) }}</span></div>
                    <div class="flex justify-between text-sm text-muted-color"><span>Tendered</span><span>{{ money(tendered()) }}</span></div>
                    <div class="flex justify-between text-sm" [class.text-green-600]="remaining() <= 0">
                        <span>{{ remaining() > 0 ? 'Remaining' : 'Change' }}</span>
                        <span class="font-semibold">{{ money(remaining() > 0 ? remaining() : -remaining()) }}</span>
                    </div>
                </div>

                <!-- Method buttons -->
                <div>
                    <div class="text-xs uppercase tracking-wider text-muted-color mb-2">Payment method</div>
                    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        <button
                            *ngFor="let m of methods"
                            type="button"
                            class="flex flex-col items-center gap-1 p-3 rounded-xl border text-sm transition"
                            [class.border-primary]="selected().method === m.method"
                            [class.bg-primary-50]="selected().method === m.method"
                            [class.dark:bg-primary-900]="selected().method === m.method"
                            [class.border-surface]="selected().method !== m.method"
                            (click)="selectMethod(m)">
                            <i [class]="m.icon" class="text-xl"></i>
                            <span class="text-[11px]">{{ m.label }}</span>
                        </button>
                    </div>
                </div>

                <!-- Method-specific inputs -->
                <div class="rounded-xl border border-surface p-4 flex flex-col gap-3">
                    <ng-container [ngSwitch]="selected().method">
                        <!-- Gift card -->
                        <div *ngSwitchCase="'GIFT_CARD'" class="flex flex-col gap-2">
                            <label class="text-xs uppercase tracking-wider text-muted-color">Gift card code</label>
                            <div class="flex gap-2">
                                <input class="flex-1 px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" [(ngModel)]="giftCode" placeholder="Enter code" />
                                <button type="button" class="px-3 py-2 rounded-lg bg-surface-200 dark:bg-surface-700" (click)="lookupGift()" [disabled]="giftBusy()">Lookup</button>
                            </div>
                            <p *ngIf="giftBalance() != null" class="text-sm text-green-600">Balance: {{ money(giftBalance()!) }}</p>
                        </div>

                        <!-- Loyalty -->
                        <div *ngSwitchCase="'LOYALTY_POINTS'" class="flex flex-col gap-2">
                            <p class="text-sm">Available points: <b>{{ customer?.loyalty_points ?? 0 }}</b> ({{ money(loyaltyValueAvailable()) }})</p>
                            <label class="text-xs uppercase tracking-wider text-muted-color">Points to redeem</label>
                            <input type="number" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" [(ngModel)]="loyaltyPoints" [max]="customer?.loyalty_points ?? 0" min="0" />
                        </div>

                        <!-- Stripe terminal -->
                        <div *ngSwitchCase="'STRIPE_TERMINAL'" class="flex flex-col gap-2">
                            <p class="text-sm">Terminal status: <b>{{ terminalStage() }}</b></p>
                            <button type="button" class="px-3 py-2 rounded-lg bg-primary text-primary-contrast w-fit" (click)="runTerminal()" [disabled]="terminalStage() === 'WAITING' || terminalStage() === 'CONFIRMING'">
                                Start card payment ({{ money(remaining() > 0 ? remaining() : totals.total) }})
                            </button>
                        </div>

                        <!-- Cash + cards + bank transfer: amount input -->
                        <div *ngSwitchDefault class="flex flex-col gap-2">
                            <label class="text-xs uppercase tracking-wider text-muted-color">Amount</label>
                            <input type="number" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" [(ngModel)]="amount" min="0" step="0.01" />
                            <ng-container *ngIf="selected().method === 'CASH'">
                                <label class="text-xs uppercase tracking-wider text-muted-color">Cash received</label>
                                <input type="number" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" [(ngModel)]="cashReceived" min="0" step="0.01" />
                            </ng-container>
                        </div>
                    </ng-container>

                    <button type="button" class="px-4 py-2 rounded-lg bg-surface-900 dark:bg-surface-0 text-surface-0 dark:text-surface-900 w-fit" (click)="addTender()">
                        Add {{ selected().label }}
                    </button>
                </div>

                <!-- Tender list -->
                <div *ngIf="tenders().length" class="flex flex-col gap-1">
                    <div *ngFor="let t of tenders(); let i = index" class="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-800">
                        <span>{{ t.method }} <span *ngIf="t.cashReceived" class="text-muted-color">(received {{ money(t.cashReceived) }})</span></span>
                        <span class="flex items-center gap-2">
                            <b>{{ money(t.amount) }}</b>
                            <button type="button" class="text-rose-500" (click)="removeTender(i)">✕</button>
                        </span>
                    </div>
                </div>

                <p *ngIf="error()" class="text-sm text-rose-600">{{ error() }}</p>
            </div>

            <ng-template pTemplate="footer">
                <button type="button" class="px-4 py-2 rounded-lg border border-surface" (click)="close.emit()">Cancel</button>
                <button type="button" class="px-5 py-2 rounded-lg bg-primary text-primary-contrast disabled:opacity-50" [disabled]="!canCharge() || busy()" (click)="charge()">
                    {{ busy() ? 'Processing…' : 'Charge ' + money(totals.total) }}
                </button>
            </ng-template>
        </p-dialog>
    `
})
export class PaymentModalComponent {
    @Input() open = false;
    @Input() cart: CartLine[] = [];
    @Input() totals!: CartTotals;
    @Input() customer: LocalCustomer | null = null;
    @Output() complete = new EventEmitter<CheckoutReceipt>();
    @Output() close = new EventEmitter<void>();

    private auth = inject(AuthStore);
    private checkout = inject(CheckoutService);
    private giftCards = inject(GiftCardsService);
    private payments = inject(PaymentsService);
    private notify = inject(NotifyService);

    readonly methods: MethodMeta[] = [
        { method: 'CASH', label: 'Cash', icon: 'pi pi-money-bill', offline: true },
        { method: 'VISA', label: 'Visa', icon: 'pi pi-credit-card', offline: false },
        { method: 'MASTERCARD', label: 'Mastercard', icon: 'pi pi-credit-card', offline: false },
        { method: 'BANK_TRANSFER', label: 'Bank Transfer', icon: 'pi pi-building-columns', offline: false },
        { method: 'GIFT_CARD', label: 'Gift Card', icon: 'pi pi-gift', offline: false },
        { method: 'LOYALTY_POINTS', label: 'Loyalty', icon: 'pi pi-star', offline: false },
        { method: 'STRIPE_TERMINAL', label: 'Card Terminal', icon: 'pi pi-mobile', offline: false }
    ];

    selected = signal<MethodMeta>(this.methods[0]);
    tenders = signal<Tender[]>([]);
    amount = 0;
    cashReceived = 0;
    giftCode = '';
    giftBalance = signal<number | null>(null);
    giftBusy = signal(false);
    loyaltyPoints = 0;
    terminalStage = signal<TerminalStage>('IDLE');
    busy = signal(false);
    error = signal<string | null>(null);

    tendered = computed(() => this.tenders().reduce((s, t) => s + t.amount, 0));
    remaining = computed(() => Number((this.totals.total - this.tendered()).toFixed(2)));
    canCharge = computed(() => this.tendered() + 1e-9 >= this.totals.total);

    private get rate(): number {
        return this.auth.config()?.loyaltyRedeemPointsPerCurrency ?? 1;
    }

    loyaltyValueAvailable(): number {
        return Number(((this.customer?.loyalty_points ?? 0) / this.rate).toFixed(2));
    }

    money(n: number): string {
        return formatMoney(n);
    }

    onVisibleChange(v: boolean): void {
        if (!v) this.close.emit();
    }

    selectMethod(m: MethodMeta): void {
        this.selected.set(m);
        this.error.set(null);
        this.amount = this.remaining() > 0 ? this.remaining() : 0;
        this.cashReceived = this.amount;
    }

    async lookupGift(): Promise<void> {
        if (!this.giftCode.trim()) return;
        this.giftBusy.set(true);
        try {
            const gc = await this.giftCards.lookupGiftCard(this.giftCode.trim());
            this.giftBalance.set(gc.balance);
            this.amount = Math.min(gc.balance, this.remaining() > 0 ? this.remaining() : gc.balance);
            (this as any)._giftId = gc.id;
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
            this.giftBalance.set(null);
        } finally {
            this.giftBusy.set(false);
        }
    }

    async runTerminal(): Promise<void> {
        const amt = this.remaining() > 0 ? this.remaining() : this.totals.total;
        try {
            this.terminalStage.set('CREATING');
            await this.payments.createConnectionToken();
            const intent = await this.payments.createTerminalIntent(amt);
            this.terminalStage.set('WAITING');
            this.terminalStage.set('CONFIRMING');
            const confirmed = await this.payments.confirmTerminalPayment(intent.id);
            this.terminalStage.set('DONE');
            this.tenders.set([
                ...this.tenders(),
                { method: 'STRIPE_TERMINAL', amount: amt, stripePaymentIntentId: confirmed.id }
            ]);
        } catch (e) {
            this.terminalStage.set('ERROR');
            this.notify.error(apiErrorMessage(e));
        }
    }

    addTender(): void {
        const m = this.selected();
        this.error.set(null);

        if (m.method === 'STRIPE_TERMINAL') {
            this.notify.info('Use "Start card payment" to add a terminal tender.');
            return;
        }

        let tender: Tender;
        if (m.method === 'GIFT_CARD') {
            if (this.giftBalance() == null) {
                this.error.set('Look up the gift card first.');
                return;
            }
            const amt = Math.min(this.amount, this.giftBalance() ?? 0);
            tender = { method: 'GIFT_CARD', amount: amt, giftCardCode: this.giftCode, giftCardId: (this as any)._giftId };
        } else if (m.method === 'LOYALTY_POINTS') {
            const maxPoints = this.customer?.loyalty_points ?? 0;
            const pts = Math.min(this.loyaltyPoints, maxPoints);
            const value = Number((pts / this.rate).toFixed(2));
            if (value <= 0) {
                this.error.set('Enter points to redeem.');
                return;
            }
            tender = { method: 'LOYALTY_POINTS', amount: value, loyaltyPointsUsed: pts };
        } else if (m.method === 'CASH') {
            const amt = this.amount || this.remaining();
            tender = { method: 'CASH', amount: amt, cashReceived: this.cashReceived || amt };
        } else {
            const amt = this.amount || this.remaining();
            if (amt <= 0) {
                this.error.set('Enter an amount.');
                return;
            }
            tender = { method: m.method, amount: amt };
        }

        this.tenders.set([...this.tenders(), tender]);
        this.amount = this.remaining() > 0 ? this.remaining() : 0;
        this.cashReceived = this.amount;
    }

    removeTender(i: number): void {
        this.tenders.set(this.tenders().filter((_, idx) => idx !== i));
    }

    async charge(): Promise<void> {
        if (!this.canCharge()) return;
        this.busy.set(true);
        this.error.set(null);
        const user = this.auth.user();
        if (!user) {
            this.error.set('Not authenticated');
            this.busy.set(false);
            return;
        }
        const base = {
            lines: this.cart,
            tenders: this.tenders(),
            employeeId: user.id,
            tenantId: user.tenantId,
            customerId: this.customer?.id ?? null
        };
        try {
            let receipt: CheckoutReceipt;
            if (CheckoutService.allOffline(this.tenders())) {
                receipt = await this.checkout.checkoutCash(base);
            } else {
                receipt = await this.checkout.checkoutTender(base);
            }
            this.complete.emit(receipt);
            this.reset();
        } catch (e) {
            this.error.set(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }

    private reset(): void {
        this.tenders.set([]);
        this.amount = 0;
        this.cashReceived = 0;
        this.giftCode = '';
        this.giftBalance.set(null);
        this.loyaltyPoints = 0;
        this.terminalStage.set('IDLE');
    }
}
