import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.scss'
})
export class ErrorStateComponent {
  @Input() title: string = 'Something went wrong';
  @Input() message?: string;
  @Input() errorCode?: string;
  @Input() primaryActionLabel: string = 'Retry';
  @Input() secondaryActionLabel: string = 'Contact support';
  @Input() showDetails: boolean = false;
  @Input() details?: string;

  @Output() onRetry = new EventEmitter<void>();
  @Output() onSecondary = new EventEmitter<void>();

  detailsExpanded: boolean = false;

  handleRetry(): void {
    this.onRetry.emit();
  }

  handleSecondary(): void {
    this.onSecondary.emit();
  }

  toggleDetails(): void {
    this.detailsExpanded = !this.detailsExpanded;
  }
}
