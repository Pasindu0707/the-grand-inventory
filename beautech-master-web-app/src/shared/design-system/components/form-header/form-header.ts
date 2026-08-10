import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';

@Component({
    selector: 'app-form-header',
    standalone: true,
    imports: [CommonModule, NgIcon],
    template: `
        <section class="border-b border-slate-100  px-4 py-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <!-- Left: icon + title + subtitle -->
                <div class="flex min-w-0 items-center gap-3">
                    <div
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        [ngClass]="iconChipClassList"
                    >
                        <ng-icon *ngIf="icon" [name]="icon" class="h-6 w-6"></ng-icon>
                    </div>

                    <div class="min-w-0">
                        <h2 class="truncate text-lg font-semibold leading-tight text-slate-950  ">
                            {{ title }}
                        </h2>
                        <p class="mt-0.5 text-sm leading-snug text-slate-500">
                            {{ subtitle }}
                        </p>
                    </div>
                </div>

                <!-- Right: optional developer content (buttons, filters, etc.) -->
                <div class="flex flex-wrap items-center justify-end gap-2">
                    <ng-content></ng-content>
                </div>
            </div>
        </section>
    `
})
export class FormHeaderComponent {
    /**
     * Heroicon name registered via `provideIcons(...)` somewhere in the app.
     * Example: "heroUserSolid"
     */
    @Input() icon: string | null = null;
    @Input() title = 'Title';
    @Input() subtitle = 'Subtitle';

    /**
     * Tailwind background (and optional ring) utilities for the icon chip.
     * Example: `bg-emerald-100`, `bg-blue-50 ring-1 ring-blue-100`
     */
    @Input() iconBgClass = 'bg-slate-100';

    /**
     * Tailwind text color for the icon (should contrast with `iconBgClass`).
     * Example: `text-emerald-700`, `text-blue-700`
     */
    @Input() iconColorClass = 'text-slate-700';

    /** Combined chip surface classes for reliable `ngClass` binding. */
    get iconChipClassList(): string {
        return [this.iconBgClass, this.iconColorClass].filter(Boolean).join(' ').trim();
    }
}
