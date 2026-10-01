/**
 * Suppliers.
 *
 * The list the delivery, purchase-order and return screens choose from. This
 * system keeps no prices - see migration 0009 - so a supplier is a name, a
 * phone number and the paperwork details accounts needs to find them.
 */
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DrawerModule } from 'primeng/drawer';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import {
    DEFAULT_PAGE_SIZE,
    emptyPage,
    type Page,
    type PageRequest,
    type SetupSupplier
} from '@/core/types';
import { AppPaginator, type PageChange } from '@/shared/paginator.component';
import { AppFilterBar, type FilterOption } from '@/shared/filter-bar.component';

@Component({
    selector: 'app-setup-suppliers',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        TagModule,
        DrawerModule,
        AppPaginator,
        AppFilterBar
    ],
    template: `
        <div class="space-y-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Suppliers</h1>
                    <p class="text-surface-500 text-sm">Who you buy from</p>
                </div>
                <button pButton icon="pi pi-plus" label="Add supplier" (click)="openAdd()"></button>
            </div>

            @if (error()) {
                <div class="app-note app-note--error">{{ error() }}</div>
            }

            <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
                <input
                    pInputText
                    class="w-64"
                    placeholder="Search by name"
                    [ngModel]="search()"
                    (ngModelChange)="onSearch($event)" />
                <app-filter-bar
                    label="Which suppliers"
                    [options]="retiredOptions"
                    [value]="includeRetired()"
                    (valueChange)="setIncludeRetired($event)" />
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                @if (suppliers().length === 0) {
                    <div class="p-10 text-center text-surface-500">
                        @if (loading()) {
                            Loading…
                        } @else {
                            <div class="space-y-3">
                                <p class="font-medium">No suppliers yet.</p>
                                <p class="text-sm">
                                    A delivery cannot be booked in until there is somebody to
                                    book it from.
                                </p>
                                <button pButton label="Add the first supplier" (click)="openAdd()"></button>
                            </div>
                        }
                    </div>
                } @else {
                    <ul class="divide-y divide-surface">
                        @for (s of suppliers(); track s.id) {
                            <li class="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-medium" [class.text-surface-400]="!s.isActive">
                                            {{ s.name }}
                                        </span>
                                        @if (!s.isActive) {
                                            <p-tag severity="secondary" value="Retired"></p-tag>
                                        }
                                    </div>
                                    <div class="text-xs text-surface-500 mt-1">
                                        {{ s.phone || 'No phone' }}
                                        @if (s.paymentTerms) {
                                            · {{ s.paymentTerms }}
                                        }
                                        @if (s.vatNo) {
                                            · VAT {{ s.vatNo }}
                                        }
                                        · {{ s.deliveries }} deliver{{
                                            s.deliveries === 1 ? 'y' : 'ies'
                                        }}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    @if (s.isActive) {
                                        <button
                                            pButton
                                            size="small"
                                            outlined
                                            label="Edit"
                                            (click)="openEdit(s)"></button>
                                        <button
                                            pButton
                                            size="small"
                                            text
                                            severity="danger"
                                            label="Retire"
                                            (click)="setActive(s, false)"></button>
                                    } @else {
                                        <button
                                            pButton
                                            size="small"
                                            outlined
                                            label="Bring back"
                                            (click)="setActive(s, true)"></button>
                                    }
                                </div>
                            </li>
                        }
                    </ul>
                    <app-paginator [page]="pageInfo()" (pageChange)="onPageChange($event)" />
                }
            </div>
        </div>

        <p-drawer
            [visible]="editing()"
            (visibleChange)="editing.set($event)"
            position="right"
            [header]="current() ? 'Edit supplier' : 'Add a supplier'"
            styleClass="!w-full sm:!w-[32rem]">
            <div class="space-y-5">
                @if (formError()) {
                    <div class="app-note app-note--error">{{ formError() }}</div>
                }

                <div>
                    <label class="block text-sm font-medium mb-1 app-req">Name</label>
                    <input
                        pInputText
                        class="w-full"
                        placeholder="e.g. Ceylon Provisions (Pvt) Ltd"
                        [ngModel]="name()"
                        (ngModelChange)="name.set($event)" />
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">Phone</label>
                        <input
                            pInputText
                            class="w-full"
                            placeholder="077 123 4567"
                            [ngModel]="phone()"
                            (ngModelChange)="phone.set($event)" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">VAT number</label>
                        <input
                            pInputText
                            class="w-full"
                            placeholder="optional"
                            [ngModel]="vatNo()"
                            (ngModelChange)="vatNo.set($event)" />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">Payment terms</label>
                    <input
                        pInputText
                        class="w-full"
                        placeholder="e.g. 30 days"
                        [ngModel]="paymentTerms()"
                        (ngModelChange)="paymentTerms.set($event)" />
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button pButton outlined label="Cancel" (click)="editing.set(false)"></button>
                    <button
                        pButton
                        icon="pi pi-check"
                        [label]="current() ? 'Save changes' : 'Add supplier'"
                        [disabled]="name().trim().length < 2 || busy()"
                        [loading]="busy()"
                        (click)="save()"></button>
                </div>
            </div>
        </p-drawer>
    `
})
export class SetupSuppliersComponent implements OnInit {
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly retiredOptions: FilterOption<boolean>[] = [
        { value: false, label: 'In use' },
        { value: true, label: 'Including retired' }
    ];

    readonly suppliers = signal<SetupSupplier[]>([]);
    readonly pageInfo = signal<Page<SetupSupplier>>(emptyPage<SetupSupplier>());
    readonly pageReq = signal<PageRequest>({ page: 1, limit: DEFAULT_PAGE_SIZE });
    readonly search = signal('');
    readonly includeRetired = signal(false);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);
    readonly formError = signal<string | null>(null);

    readonly editing = signal(false);
    readonly current = signal<SetupSupplier | null>(null);
    readonly name = signal('');
    readonly phone = signal('');
    readonly vatNo = signal('');
    readonly paymentTerms = signal('');

    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    async ngOnInit(): Promise<void> {
        await this.load();
    }

    onSearch(value: string): void {
        this.search.set(value);
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
            this.pageReq.set({ ...this.pageReq(), page: 1 });
            void this.load();
        }, 250);
    }

    setIncludeRetired(value: boolean): void {
        this.includeRetired.set(value);
        this.pageReq.set({ ...this.pageReq(), page: 1 });
        void this.load();
    }

    onPageChange(e: PageChange): void {
        this.pageReq.set(e);
        void this.load();
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            const page = await this.api.setupSuppliers({
                ...this.pageReq(),
                search: this.search().trim() || undefined,
                includeRetired: this.includeRetired()
            });
            this.pageInfo.set(page);
            this.suppliers.set(page.items);
            this.error.set(null);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    openAdd(): void {
        this.current.set(null);
        this.formError.set(null);
        this.name.set('');
        this.phone.set('');
        this.vatNo.set('');
        this.paymentTerms.set('');
        this.editing.set(true);
    }

    openEdit(supplier: SetupSupplier): void {
        this.current.set(supplier);
        this.formError.set(null);
        this.name.set(supplier.name);
        this.phone.set(supplier.phone ?? '');
        this.vatNo.set(supplier.vatNo ?? '');
        this.paymentTerms.set(supplier.paymentTerms ?? '');
        this.editing.set(true);
    }

    async save(): Promise<void> {
        this.busy.set(true);
        this.formError.set(null);
        const body = {
            name: this.name().trim(),
            phone: this.phone().trim() || null,
            vatNo: this.vatNo().trim() || null,
            paymentTerms: this.paymentTerms().trim() || null
        };
        try {
            const existing = this.current();
            if (existing) {
                await this.api.updateSupplier(existing.id, body);
                this.notify.success(`${body.name} saved`);
            } else {
                await this.api.createSupplier(body);
                this.notify.success(`${body.name} added`);
            }
            this.editing.set(false);
            await this.load();
        } catch (err) {
            this.formError.set(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async setActive(supplier: SetupSupplier, isActive: boolean): Promise<void> {
        if (!isActive) {
            const ok = await this.notify.confirm(
                `${supplier.name} will not be offered on new deliveries. Everything already received from them stays on record.`,
                'Retire this supplier?',
                'Retire'
            );
            if (!ok) return;
        }
        try {
            await this.api.updateSupplier(supplier.id, { isActive });
            await this.load();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        }
    }
}
