/**
 * Gallery-only PrimeNG `p-table` demo: caption, lazy slice, `#loadingbody`, `#emptymessage`, row menu.
 * Binds to `mock-data/table-demo.mock.ts`. Use as a reference in `/dev/design-system`; in real features,
 * compose `p-table` in your module and bind production data (do not import mocks from feature code).
 */
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
    heroEllipsisVerticalSolid,
    heroInboxStackSolid,
    heroMagnifyingGlassSolid,
    heroPlusSolid
} from '@ng-icons/heroicons/solid';
import type { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { SkeletonModule } from 'primeng/skeleton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';
import {
    buildTableDemoRows,
    TABLE_DEMO_ROW_MENU_MOCK,
    TABLE_DEMO_UI_MOCK,
    type TableDemoRow
} from '../../mock-data/table-demo.mock';

@Component({
    selector: 'app-design-system-table',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        TableModule,
        ButtonModule,
        MenuModule,
        SkeletonModule,
        IconFieldModule,
        InputIconModule,
        InputTextModule,
        NgIcon,
        StatusBadgeComponent
    ],
    providers: [
        provideIcons({
            heroMagnifyingGlassSolid,
            heroPlusSolid,
            heroEllipsisVerticalSolid,
            heroInboxStackSolid
        })
    ],
    template: `
        <p-table
            [value]="sampleList"
            dataKey="id"
            [paginator]="true"
            [rows]="pageSize"
            [first]="first"
            [lazy]="true"
            [loading]="loading"
            [rowHover]="true"
            [totalRecords]="totalRecords"
            currentPageReportTemplate="Showing {first} to {last} of {totalRecords} entries"
            [showCurrentPageReport]="true"
            (onLazyLoad)="loadLazy($event)"
            showGridlines
            [rowsPerPageOptions]="[10, 25, 50]"
        >
            <ng-template #caption>
                <div class="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
                    <div class="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-center">
                        <div class="whitespace-nowrap text-2xl font-semibold">{{ ui.captionTitle }}</div>
                        <p-iconField iconPosition="left" class="min-w-[200px] flex-1">
                            <p-inputIcon>
                                <ng-icon name="heroMagnifyingGlassSolid" class="h-4 w-4"></ng-icon>
                            </p-inputIcon>
                            <input
                                pInputText
                                type="text"
                                [formControl]="searchControl"
                                [attr.placeholder]="ui.searchPlaceholder"
                                class="w-full"
                            />
                        </p-iconField>
                    </div>
                    <div class="flex w-full justify-end sm:w-auto">
                        <p-button [label]="ui.newRecordLabel" class="w-full sm:w-auto">
                            <ng-template pTemplate="icon">
                                <ng-icon name="heroPlusSolid" class="h-4 w-4"></ng-icon>
                            </ng-template>
                        </p-button>
                    </div>
                </div>
            </ng-template>

            <ng-template #header>
                <tr class="custom-table-header">
                    <th style="min-width: 12rem">Reference</th>
                    <th style="min-width: 12rem">Name</th>
                    <th style="min-width: 12rem">Date</th>
                    <th style="min-width: 12rem">Amount</th>
                    <th style="min-width: 12rem">Status</th>
                    <th style="min-width: 12rem">Created by</th>
                    <th style="width: 50px; min-width: 50px" class="text-center-col">Actions</th>
                </tr>
            </ng-template>

            <ng-template #body let-row>
                <tr class="custom-table-data">
                    <td>{{ row.referenceNo }}</td>
                    <td>{{ row.name }}</td>
                    <td>{{ row.date }}</td>
                    <td>
                        <div class="w-full text-right font-semibold">
                            {{ row.amount | currency: row.currency + ' ' }}
                        </div>
                    </td>
                    <td>
                        <app-status-badge [status]="formatStatus(row.status)"></app-status-badge>
                    </td>
                    <td>{{ row.createdBy }} &#64; {{ row.createdAt | date }}</td>
                    <td class="flex justify-center">
                        <p-menu #menu [popup]="true" [model]="getMenuItems(row)" appendTo="body"></p-menu>
                        <button
                            pButton
                            type="button"
                            class="p-button-text p-button-sm"
                            (click)="$event.stopPropagation(); menu.toggle($event)"
                            title="Actions"
                        >
                            <ng-icon name="heroEllipsisVerticalSolid" class="h-4 w-4"></ng-icon>
                        </button>
                    </td>
                </tr>
            </ng-template>

            <ng-template #emptymessage>
                <tr>
                    <td colspan="7">
                        <div
                            class="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center text-slate-600"
                        >
                            <ng-icon name="heroInboxStackSolid" class="h-10 w-10 text-slate-300"></ng-icon>
                            <p class="text-base font-medium text-slate-800">{{ ui.emptyTitle }}</p>
                            <p class="text-sm text-slate-500">{{ ui.emptySubtitle }}</p>
                        </div>
                    </td>
                </tr>
            </ng-template>

            <ng-template #loadingbody>
                <tr *ngFor="let _ of [1, 2, 3, 4, 5]" class="custom-table-data">
                    <td><p-skeleton height="1.25rem" class="w-full max-w-[12rem]"></p-skeleton></td>
                    <td><p-skeleton height="1.25rem" class="w-full max-w-[12rem]"></p-skeleton></td>
                    <td><p-skeleton height="1.25rem" class="w-full max-w-[8rem]"></p-skeleton></td>
                    <td><p-skeleton height="1.25rem" class="ml-auto w-full max-w-[8rem]"></p-skeleton></td>
                    <td><p-skeleton height="1.5rem" class="w-24"></p-skeleton></td>
                    <td><p-skeleton height="1.25rem" class="w-full max-w-[14rem]"></p-skeleton></td>
                    <td class="flex justify-center">
                        <p-skeleton shape="circle" size="2rem"></p-skeleton>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `
})
export class DesignSystemTableComponent {
    readonly ui = TABLE_DEMO_UI_MOCK;

    readonly searchControl = new FormControl('', { nonNullable: true });

    sampleList: TableDemoRow[] = [];
    totalRecords = 0;
    pageSize = 10;
    first = 0;
    loading = false;

    private readonly allRows: TableDemoRow[] = buildTableDemoRows();

    loadLazy(event: TableLazyLoadEvent): void {
        this.loading = true;
        this.first = event.first ?? 0;
        this.pageSize = event.rows ?? 10;
        const filter = (this.searchControl.value || '').toLowerCase().trim();

        window.setTimeout(() => {
            let rows = [...this.allRows];
            if (filter) {
                rows = rows.filter(
                    (r) =>
                        r.referenceNo.toLowerCase().includes(filter) ||
                        r.name.toLowerCase().includes(filter)
                );
            }
            this.totalRecords = rows.length;
            const slice = rows.slice(this.first, this.first + this.pageSize);
            this.sampleList = slice;
            this.loading = false;
        }, 350);
    }

    formatStatus(raw: string): string {
        return raw.replace(/_/g, ' ');
    }

    getMenuItems(_row: TableDemoRow): MenuItem[] {
        return TABLE_DEMO_ROW_MENU_MOCK;
    }
}
