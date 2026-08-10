import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tag } from 'primeng/tag';
import type { StatusTone } from './status-badge.types';
import { getStatusUi } from './status-badge.utils';

@Component({
    selector: 'app-status-badge',
    standalone: true,
    imports: [Tag, CommonModule],
    templateUrl: './status-badge.component.html',
    styleUrl: './status-badge.component.scss'
})
export class StatusBadgeComponent {
    @Input() status: unknown;
    @Input() overrideLabel?: string;
    @Input() className = '';
    @Input() unknownTone: StatusTone = 'neutral';
    @Input() variant: 'status' | 'meta' = 'status';

    get ui() {
        const base = getStatusUi(this.status);
        if (base.key === 'UNKNOWN') {
            return { ...base, tone: this.unknownTone };
        }
        return base;
    }

    get value(): string {
        return this.overrideLabel?.trim() || this.ui.label;
    }

    get styleClass(): string {
        return [
            'status-badge-modern',
            `status-tone-${this.ui.tone}`,
            this.variant === 'meta' ? 'is-meta' : '',
            this.className
        ]
            .filter(Boolean)
            .join(' ');
    }
}
