/** Reusable pagination (FRONTEND_DOCUMENTATION.md §2.1 Pagination). */
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'pos-pagination',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="flex items-center justify-between gap-3 flex-wrap py-2" *ngIf="total > 0">
            <span class="text-sm text-muted-color">Showing {{ from }}–{{ to }} of {{ total }}</span>
            <div class="flex items-center gap-1">
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-lg border border-surface text-sm disabled:opacity-40 hover:bg-surface-100 dark:hover:bg-surface-800"
                    [disabled]="page <= 1"
                    (click)="go(page - 1)">
                    Prev
                </button>
                <ng-container *ngFor="let p of pages()">
                    <span *ngIf="p === -1" class="px-2 text-muted-color">…</span>
                    <button
                        *ngIf="p !== -1"
                        type="button"
                        class="min-w-9 px-3 py-1.5 rounded-lg border text-sm"
                        [class.bg-primary]="p === page"
                        [class.text-primary-contrast]="p === page"
                        [class.border-primary]="p === page"
                        [class.border-surface]="p !== page"
                        (click)="go(p)">
                        {{ p }}
                    </button>
                </ng-container>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-lg border border-surface text-sm disabled:opacity-40 hover:bg-surface-100 dark:hover:bg-surface-800"
                    [disabled]="page >= totalPages()"
                    (click)="go(page + 1)">
                    Next
                </button>
            </div>
        </div>
    `
})
export class PaginationComponent {
    @Input() page = 1;
    @Input() pageSize = 15;
    @Input() total = 0;
    @Output() change = new EventEmitter<{ page: number; pageSize: number }>();

    private _ = signal(0);

    totalPages = computed(() => {
        this._();
        return Math.max(1, Math.ceil(this.total / this.pageSize));
    });

    get from(): number {
        return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
    }
    get to(): number {
        return Math.min(this.total, this.page * this.pageSize);
    }

    pages = computed(() => {
        this._();
        const tp = Math.max(1, Math.ceil(this.total / this.pageSize));
        const cur = this.page;
        const out: number[] = [];
        const push = (n: number) => out.push(n);
        if (tp <= 7) {
            for (let i = 1; i <= tp; i++) push(i);
            return out;
        }
        push(1);
        if (cur > 3) push(-1);
        for (let i = Math.max(2, cur - 1); i <= Math.min(tp - 1, cur + 1); i++) push(i);
        if (cur < tp - 2) push(-1);
        push(tp);
        return out;
    });

    go(p: number): void {
        const tp = Math.max(1, Math.ceil(this.total / this.pageSize));
        const next = Math.min(Math.max(1, p), tp);
        if (next === this.page) return;
        this.change.emit({ page: next, pageSize: this.pageSize });
    }
}
