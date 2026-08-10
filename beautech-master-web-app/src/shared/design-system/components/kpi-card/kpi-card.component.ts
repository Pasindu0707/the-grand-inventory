import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { TooltipModule } from 'primeng/tooltip';
import {
  heroArrowDownOnSquareSolid,
  heroBanknotesSolid,
  heroBellAlertSolid,
  heroChartBarSolid,
  heroChartPieSolid,
  heroCheckCircleSolid,
  heroClockSolid,
  heroCurrencyDollarSolid,
  heroExclamationCircleSolid,
  heroExclamationTriangleSolid,
  heroFlagSolid,
  heroHomeSolid,
  heroInformationCircleSolid,
  heroLightBulbSolid,
  heroPaperAirplaneSolid,
  heroShieldExclamationSolid
} from '@ng-icons/heroicons/solid';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, NgIcon, TooltipModule],
  providers: [
    provideIcons({
      heroHomeSolid,
      heroCurrencyDollarSolid,
      heroExclamationCircleSolid,
      heroInformationCircleSolid,
      heroCheckCircleSolid,
      heroChartBarSolid,
      heroPaperAirplaneSolid,
      heroBellAlertSolid,
      heroChartPieSolid,
      heroBanknotesSolid,
      heroArrowDownOnSquareSolid,
      heroFlagSolid,
      heroExclamationTriangleSolid,
      heroShieldExclamationSolid,
      heroLightBulbSolid,
      heroClockSolid
    })
  ],
  template: `
    <div class="flex h-full flex-col rounded-xl border bg-white px-4 py-3.5" [ngClass]="cardBorderClass">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{{ label }}</p>
            <button
              *ngIf="showInfoIcon"
              type="button"
              class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              [pTooltip]="infoTooltipText"
              tooltipPosition="top"
              [attr.aria-label]="'About: ' + label"
            >
              <ng-icon name="heroInformationCircleSolid" class="text-[14px]" />
            </button>
          </div>

          <h3
            class="mt-2 text-2xl font-semibold tracking-tight tabular-nums"
            [ngClass]="valueClass || 'text-slate-950'"
          >
            {{ value }}
          </h3>
        </div>

        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
          [ngClass]="kpiIconBgClass"
        >
          <ng-icon [name]="icon" class="text-[18px]" />
        </div>
      </div>
    </div>
  `,
})
export class KpiCardComponent {
  @Input() label: string = '';
  @Input() value: string = '';
  @Input() severity: 'success' | 'warn' | 'danger' | 'info' | 'secondary' = 'secondary';
  @Input() icon: string = 'heroChartBarSolid';

  /** Optional Tailwind classes for the value line (e.g. `font-mono text-rose-600`). */
  @Input() valueClass = '';

  /** Quick summary shown in the info tooltip. */
  @Input() infoSummary?: string;

  /** Legacy input name (older pages might still pass `tooltip`). */
  @Input() tooltip?: string;

  /** When false, hides the info icon entirely. */
  @Input() showInfoIcon = true;

  get infoTooltipText(): string {
    const s = this.infoSummary?.trim();
    if (s) return s;
    const tt = this.tooltip?.trim();
    if (tt) return tt;
    return this.label?.trim() || 'KPI info';
  }

  get cardBorderClass(): string {
    switch (this.severity) {
      case 'danger':
        return 'border-rose-200';
      case 'warn':
        return 'border-amber-200';
      case 'info':
        return 'border-sky-200';
      case 'secondary':
        return 'border-slate-200';
      default:
        return 'border-emerald-200';
    }
  }

  get kpiIconBgClass(): string {
    switch (this.severity) {
      case 'danger':
        return 'bg-rose-500';
      case 'warn':
        return 'bg-amber-500';
      case 'info':
        return 'bg-sky-500';
      case 'secondary':
        return 'bg-slate-500';
      default:
        return 'bg-emerald-500';
    }
  }
}
