import { EMPTY_STATE_DEMO_MOCK } from './empty-state-demo.mock';
import { ERROR_STATE_DEMO_MOCK } from './error-state-demo.mock';
import { FORM_HEADER_DEMO_MOCK } from './form-header-demo.mock';
import { KPI_GALLERY_DEMO_MOCK } from './kpi-gallery.mock';
import { STATUS_BADGE_DEMO_MOCK } from './status-badge-demo.mock';
import { TABLE_DEMO_UI_MOCK } from './table-demo.mock';

const k0 = KPI_GALLERY_DEMO_MOCK[3];
const ui = TABLE_DEMO_UI_MOCK;

/** Copy-paste snippets for the gallery — derived from mock payloads so strings stay single-source. */
export const CODE_SNIPPETS_MOCK = {
    status: `<app-status-badge [status]="'${STATUS_BADGE_DEMO_MOCK.workflowStatus}'" variant="status"></app-status-badge>`,
    meta: `<app-status-badge [status]="metaLabel" variant="meta"></app-status-badge>`,
    formHeader: `<app-form-header
  [icon]="'${FORM_HEADER_DEMO_MOCK.icon}'"
  [title]="'${FORM_HEADER_DEMO_MOCK.title}'"
  [subtitle]="'${FORM_HEADER_DEMO_MOCK.subtitle}'"
  iconBgClass="${FORM_HEADER_DEMO_MOCK.iconBgClass}"
  iconColorClass="${FORM_HEADER_DEMO_MOCK.iconColorClass}"
>
  <button type="button" pButton [label]="'${FORM_HEADER_DEMO_MOCK.primaryActionLabel}'" class="p-button-outlined p-button-sm"></button>
</app-form-header>`,
    kpi: `<app-kpi-card
  label="${k0.label}"
  value="${k0.value}"
  severity="${k0.severity}"
  icon="${k0.icon}"
  infoSummary="${k0.infoSummary ?? ''}"
></app-kpi-card>`,
    empty: `<app-empty-state
  title="${EMPTY_STATE_DEMO_MOCK.title}"
  subtitle="${EMPTY_STATE_DEMO_MOCK.subtitle}"
  primaryActionLabel="${EMPTY_STATE_DEMO_MOCK.primaryActionLabel}"
  (onPrimaryAction)="onCreate()"
></app-empty-state>`,
    error: `<app-error-state
  title="${ERROR_STATE_DEMO_MOCK.title}"
  message="${ERROR_STATE_DEMO_MOCK.message}"
  errorCode="${ERROR_STATE_DEMO_MOCK.errorCode}"
  (onRetry)="reload()"
></app-error-state>`,

    // Kit embed + p-table pattern; caption/empty strings from TABLE_DEMO_UI_MOCK
    table: [
        '// ── Option A — reuse the design-system demo table (includes mock-backed rows in the kit)',
        "import { DesignSystemTableComponent } from '@/shared/design-system/components/table/design-system-table.component';",
        '// imports: [ CommonModule, DesignSystemTableComponent, ... ]',
        '<app-design-system-table></app-design-system-table>',
        '',
        '// ── Option B — production p-table (bind your API data; add TableModule, ButtonModule, MenuModule,',
        '// SkeletonModule, IconFieldModule, InputIconModule, InputTextModule, ReactiveFormsModule, NgIcon + provideIcons, StatusBadgeComponent)',
        `<p-table
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
        <div class="whitespace-nowrap text-2xl font-semibold">${ui.captionTitle}</div>
        <p-iconField iconPosition="left" class="min-w-[200px] flex-1">
          <p-inputIcon><ng-icon name="heroMagnifyingGlassSolid" class="h-4 w-4"></ng-icon></p-inputIcon>
          <input pInputText type="text" [formControl]="searchControl" placeholder="${ui.searchPlaceholder}" class="w-full" />
        </p-iconField>
      </div>
      <div class="flex w-full justify-end sm:w-auto">
        <p-button label="${ui.newRecordLabel}" class="w-full sm:w-auto">
          <ng-template pTemplate="icon"><ng-icon name="heroPlusSolid" class="h-4 w-4"></ng-icon></ng-template>
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
      <td><div class="w-full text-right font-semibold">{{ row.amount | currency: row.currency + ' ' }}</div></td>
      <td><app-status-badge [status]="formatStatus(row.status)"></app-status-badge></td>
      <td>{{ row.createdBy }} &#64; {{ row.createdAt | date }}</td>
      <td class="flex justify-center">
        <p-menu #menu [popup]="true" [model]="getMenuItems(row)" appendTo="body"></p-menu>
        <button pButton type="button" class="p-button-text p-button-sm" (click)="$event.stopPropagation(); menu.toggle($event)" title="Actions">
          <ng-icon name="heroEllipsisVerticalSolid" class="h-4 w-4"></ng-icon>
        </button>
      </td>
    </tr>
  </ng-template>
  <ng-template #emptymessage>
    <tr>
      <td colspan="7">
        <div class="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center text-slate-600">
          <ng-icon name="heroInboxStackSolid" class="h-10 w-10 text-slate-300"></ng-icon>
          <p class="text-base font-medium text-slate-800">${ui.emptyTitle}</p>
          <p class="text-sm text-slate-500">${ui.emptySubtitle}</p>
        </div>
      </td>
    </tr>
  </ng-template>
  <ng-template #loadingbody>
    <tr *ngFor="let _ of [1,2,3,4,5]" class="custom-table-data">
      <td><p-skeleton height="1.25rem" class="w-full max-w-[12rem]"></p-skeleton></td>
      <td><p-skeleton height="1.25rem" class="w-full max-w-[12rem]"></p-skeleton></td>
      <td><p-skeleton height="1.25rem" class="w-full max-w-[8rem]"></p-skeleton></td>
      <td><p-skeleton height="1.25rem" class="ml-auto w-full max-w-[8rem]"></p-skeleton></td>
      <td><p-skeleton height="1.5rem" class="w-24"></p-skeleton></td>
      <td><p-skeleton height="1.25rem" class="w-full max-w-[14rem]"></p-skeleton></td>
      <td class="flex justify-center"><p-skeleton shape="circle" size="2rem"></p-skeleton></td>
    </tr>
  </ng-template>
</p-table>`
    ].join('\n')
} as const;
