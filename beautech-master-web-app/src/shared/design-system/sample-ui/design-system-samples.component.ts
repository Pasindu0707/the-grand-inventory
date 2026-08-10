import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
    heroBars3Solid,
    heroDocumentTextSolid,
    heroExclamationTriangleSolid,
    heroSwatchSolid
} from '@ng-icons/heroicons/solid';
import { CODE_SNIPPETS_MOCK } from '../mock-data/code-snippets.mock';
import { EMPTY_STATE_DEMO_MOCK } from '../mock-data/empty-state-demo.mock';
import { ERROR_STATE_DEMO_MOCK } from '../mock-data/error-state-demo.mock';
import { FORM_HEADER_DEMO_MOCK } from '../mock-data/form-header-demo.mock';
import { GALLERY_FEEDBACK_MOCK, GALLERY_NAV_MOCK, GALLERY_PAGE_MOCK } from '../mock-data/gallery-page.mock';
import { GALLERY_SECTIONS_COPY_MOCK } from '../mock-data/gallery-sections.mock';
import { KPI_GALLERY_DEMO_MOCK } from '../mock-data/kpi-gallery.mock';
import { STATUS_BADGE_DEMO_MOCK } from '../mock-data/status-badge-demo.mock';
import { EmptyStateComponent } from '../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../components/error-state/error-state.component';
import { FormHeaderComponent } from '../components/form-header/form-header';
import { KpiCardComponent } from '../components/kpi-card/kpi-card.component';
import { StatusBadgeComponent } from '../components/status-badge/status-badge.component';
import { DesignSystemTableComponent } from '../components/table/design-system-table.component';

@Component({
    selector: 'app-design-system-samples',
    standalone: true,
    imports: [
        CommonModule,
        ClipboardModule,
        NgIcon,
        StatusBadgeComponent,
        EmptyStateComponent,
        ErrorStateComponent,
        FormHeaderComponent,
        KpiCardComponent,
        DesignSystemTableComponent,
        ButtonModule
    ],
    providers: [
        provideIcons({
            heroDocumentTextSolid,
            heroBars3Solid,
            heroExclamationTriangleSolid,
            heroSwatchSolid
        })
    ],
    templateUrl: './design-system-samples.component.html'
})
export class DesignSystemSamplesComponent {
    readonly page = GALLERY_PAGE_MOCK;
    readonly nav = GALLERY_NAV_MOCK;
    readonly sections = GALLERY_SECTIONS_COPY_MOCK;
    readonly statusDemo = STATUS_BADGE_DEMO_MOCK;
    readonly kpiGallery = KPI_GALLERY_DEMO_MOCK;
    readonly formHeaderDemo = FORM_HEADER_DEMO_MOCK;
    readonly emptyDemo = EMPTY_STATE_DEMO_MOCK;
    readonly errorDemo = ERROR_STATE_DEMO_MOCK;

    readonly statusTagSnippetStatus = CODE_SNIPPETS_MOCK.status;
    readonly statusTagSnippetMeta = CODE_SNIPPETS_MOCK.meta;
    readonly snippetFormHeader = CODE_SNIPPETS_MOCK.formHeader;
    readonly snippetKpi = CODE_SNIPPETS_MOCK.kpi;
    readonly snippetEmpty = CODE_SNIPPETS_MOCK.empty;
    readonly snippetError = CODE_SNIPPETS_MOCK.error;
    readonly snippetTable = CODE_SNIPPETS_MOCK.table;

    lastCopied: 'status' | 'meta' | 'form' | 'kpi' | 'empty' | 'error' | 'table' | null = null;
    private copyFeedbackReset?: ReturnType<typeof setTimeout>;

    demoToast = '';

    copyLabel(id: 'status' | 'meta' | 'form' | 'kpi' | 'empty' | 'error' | 'table'): string {
        return this.lastCopied === id ? 'Copied' : 'Copy';
    }

    onSnippetCopied(id: 'status' | 'meta' | 'form' | 'kpi' | 'empty' | 'error' | 'table', success: boolean): void {
        if (!success) {
            return;
        }
        this.lastCopied = id;
        if (this.copyFeedbackReset) {
            clearTimeout(this.copyFeedbackReset);
        }
        this.copyFeedbackReset = setTimeout(() => {
            this.lastCopied = null;
        }, 2000);
    }

    onEmptyPrimary(): void {
        this.demoToast = GALLERY_FEEDBACK_MOCK.emptyPrimary;
    }

    onErrorRetry(): void {
        this.demoToast = GALLERY_FEEDBACK_MOCK.errorRetry;
    }
}
