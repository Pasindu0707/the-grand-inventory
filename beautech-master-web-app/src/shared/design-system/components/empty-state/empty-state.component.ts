import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

export type EmptyStateSize = 'sm' | 'md' | 'lg';
export type EmptyStateVariant = 'card' | 'inline';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss'
})
export class EmptyStateComponent {
  @Input() icon?: string = 'pi pi-inbox';
  @Input() title!: string;
  @Input() subtitle?: string;
  @Input() primaryActionLabel?: string;
  @Input() secondaryActionLabel?: string;
  @Input() size: EmptyStateSize = 'md';
  @Input() variant: EmptyStateVariant = 'inline';

  @Output() onPrimaryAction = new EventEmitter<void>();
  @Output() onSecondaryAction = new EventEmitter<void>();

  handlePrimaryAction(): void {
    if (this.onPrimaryAction) {
      this.onPrimaryAction.emit();
    }
  }

  handleSecondaryAction(): void {
    if (this.onSecondaryAction) {
      this.onSecondaryAction.emit();
    }
  }
}
