/**
 * Cleaning checklist for the business day.
 *
 * Grouped by area because that is how someone works — you finish the kitchen,
 * then you move to the bar. Weekly and monthly tasks show when they were last
 * done, so it is obvious what has been quietly skipped for a fortnight.
 *
 * Tapping is the whole interaction. A photo is optional and only worth taking
 * for the things a manager would otherwise have to walk over and look at.
 */
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import type { CleaningTask } from '@/core/types';

@Component({
    selector: 'app-cleaning',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule],
    template: `
        <div class="space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="text-2xl font-bold">Cleaning</h1>
                    <p class="text-surface-500 text-sm">{{ businessDate() }}</p>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-bold">{{ doneCount() }} / {{ tasks().length }}</div>
                    <div class="text-xs text-surface-500">done today</div>
                </div>
            </div>

            @if (error()) {
                <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 p-4">{{ error() }}</div>
            }

            @if (loading()) {
                <p class="text-surface-500">Loading…</p>
            }

            @for (area of areas(); track area.code) {
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 overflow-hidden">
                    <div class="p-4 border-b border-surface flex items-center justify-between">
                        <span class="font-semibold">{{ area.name }}</span>
                        <span class="text-xs text-surface-500">
                            {{ area.done }} / {{ area.tasks.length }}
                        </span>
                    </div>
                    <ul class="divide-y divide-surface">
                        @for (task of area.tasks; track task.taskId) {
                            <li class="p-4 flex flex-wrap items-center justify-between gap-3">
                                <div class="min-w-0 flex items-center gap-3">
                                    <button
                                        type="button"
                                        class="w-9 h-9 rounded-lg border-2 flex items-center justify-center shrink-0 transition"
                                        [class.border-green-500]="task.doneToday"
                                        [class.bg-green-500]="task.doneToday"
                                        [class.text-white]="task.doneToday"
                                        [class.border-surface-300]="!task.doneToday"
                                        [disabled]="task.doneToday || busy()"
                                        (click)="markDone(task)"
                                        [attr.aria-label]="'Mark done: ' + task.name">
                                        @if (task.doneToday) {
                                            <i class="pi pi-check"></i>
                                        }
                                    </button>
                                    <div class="min-w-0">
                                        <div class="font-medium" [class.line-through]="task.doneToday" [class.text-surface-400]="task.doneToday">
                                            {{ task.name }}
                                        </div>
                                        <div class="text-xs text-surface-500">
                                            {{ task.frequency }}
                                            @if (task.doneToday && task.lastDoneBy) {
                                                · {{ task.lastDoneBy }}
                                            } @else if (task.lastDoneOn) {
                                                · last done {{ task.lastDoneOn }}
                                            } @else {
                                                · never logged
                                            }
                                        </div>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    @if (task.frequency !== 'daily') {
                                        <p-tag severity="secondary" [value]="task.frequency"></p-tag>
                                    }
                                    @if (task.verified) {
                                        <p-tag severity="success" value="Verified"></p-tag>
                                    } @else if (task.doneToday && canVerify()) {
                                        <button pButton size="small" outlined label="Verify" (click)="verify(task)"></button>
                                    }
                                </div>
                            </li>
                        }
                    </ul>
                </div>
            }
        </div>
    `
})
export class CleaningComponent implements OnInit {
    private auth = inject(AuthStore);
    private api = inject(GrandService);
    private notify = inject(NotifyService);

    readonly tasks = signal<CleaningTask[]>([]);
    readonly businessDate = signal('');
    readonly loading = signal(true);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);

    readonly doneCount = computed(() => this.tasks().filter((t) => t.doneToday).length);
    readonly canVerify = computed(() => ['owner', 'manager'].includes(this.auth.role() ?? ''));

    readonly areas = computed(() => {
        const byArea = new Map<string, { code: string; name: string; tasks: CleaningTask[]; done: number }>();
        for (const task of this.tasks()) {
            const entry =
                byArea.get(task.areaCode) ??
                { code: task.areaCode, name: task.areaName, tasks: [], done: 0 };
            entry.tasks.push(task);
            if (task.doneToday) entry.done += 1;
            byArea.set(task.areaCode, entry);
        }
        return [...byArea.values()];
    });

    async ngOnInit(): Promise<void> {
        await this.load();
    }

    async load(): Promise<void> {
        this.loading.set(true);
        try {
            const res = await this.api.cleaningToday();
            this.tasks.set(res.tasks);
            this.businessDate.set(res.businessDate);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    async markDone(task: CleaningTask): Promise<void> {
        if (task.doneToday) return;
        this.busy.set(true);
        try {
            await this.api.logCleaning(task.taskId);
            await this.load();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        } finally {
            this.busy.set(false);
        }
    }

    async verify(task: CleaningTask): Promise<void> {
        if (!task.logId) return;
        try {
            await this.api.verifyCleaning(task.logId);
            await this.load();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        }
    }
}
