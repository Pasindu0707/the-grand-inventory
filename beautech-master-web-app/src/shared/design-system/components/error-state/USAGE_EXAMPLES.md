# Error State Component - Usage Examples

## Basic Usage

### Simple Error State
```html
<app-error-state
  message="We couldn't load your data. Please try again."
  (onRetry)="retry()"
></app-error-state>
```

### With Custom Title
```html
<app-error-state
  title="Failed to load templates"
  message="There was a problem connecting to the server."
  (onRetry)="loadTemplates()"
></app-error-state>
```

## Complete Examples

### 1. API Error with Error Code
```html
<app-error-state
  title="Failed to load data"
  message="We encountered an issue while fetching your templates."
  errorCode="ERR_500"
  primaryActionLabel="Try again"
  secondaryActionLabel="Contact support"
  (onRetry)="retryLoad()"
  (onSecondary)="contactSupport()"
></app-error-state>
```

### 2. Network Error
```html
<app-error-state
  title="Connection failed"
  message="Please check your internet connection and try again."
  primaryActionLabel="Retry"
  (onRetry)="retryConnection()"
></app-error-state>
```

### 3. With Technical Details (Expandable)
```html
<app-error-state
  title="Something went wrong"
  message="We couldn't process your request. Please try again or contact support if the problem persists."
  errorCode="ERR_400"
  [showDetails]="true"
  [details]="errorDetails"
  (onRetry)="retry()"
  (onSecondary)="contactSupport()"
></app-error-state>
```

### 4. In Component with Error Handling
```typescript
export class MyComponent {
  error: any = null;
  errorDetails: string = '';

  loadData(): void {
    this.service.getData().subscribe({
      next: (data) => {
        this.data = data;
        this.error = null;
      },
      error: (err) => {
        this.error = err;
        this.errorDetails = JSON.stringify(err, null, 2);
      }
    });
  }

  retry(): void {
    this.loadData();
  }

  contactSupport(): void {
    // Open support ticket or email
    window.open('mailto:support@example.com?subject=Error Report');
  }
}
```

```html
<div *ngIf="error">
  <app-error-state
    title="Failed to load data"
    message="We encountered an error while loading your information."
    [errorCode]="error.code"
    [showDetails]="true"
    [details]="errorDetails"
    (onRetry)="retry()"
    (onSecondary)="contactSupport()"
  ></app-error-state>
</div>
```

### 5. In Table Empty State (Error)
```html
<p-table [value]="items">
  <!-- table templates -->
  
  <ng-template pTemplate="emptymessage">
    <div *ngIf="hasError" class="py-12">
      <app-error-state
        title="Failed to load data"
        message="We couldn't retrieve the table data."
        (onRetry)="loadTableData()"
      ></app-error-state>
    </div>
  </ng-template>
</p-table>
```

### 6. Minimal Error (No Actions)
```html
<app-error-state
  title="Service unavailable"
  message="The service is temporarily unavailable. Please try again later."
  [primaryActionLabel]="null"
  [secondaryActionLabel]="null"
></app-error-state>
```

### 7. Custom Action Labels
```html
<app-error-state
  title="Upload failed"
  message="Your file couldn't be uploaded. Please check the file and try again."
  primaryActionLabel="Upload again"
  secondaryActionLabel="Cancel"
  (onRetry)="retryUpload()"
  (onSecondary)="cancelUpload()"
></app-error-state>
```

### 8. In Card Container
```html
<div class="p-6">
  <app-error-state
    title="Connection timeout"
    message="The request took too long to complete."
    errorCode="TIMEOUT_001"
    (onRetry)="retry()"
  ></app-error-state>
</div>
```

### 9. Full Page Error
```html
<div class="flex items-center justify-center min-h-screen p-4">
  <app-error-state
    title="Page not available"
    message="We're having trouble loading this page. Please try again."
    primaryActionLabel="Reload page"
    secondaryActionLabel="Go back"
    (onRetry)="window.location.reload()"
    (onSecondary)="goBack()"
  ></app-error-state>
</div>
```

### 10. Error with Stack Trace
```html
<app-error-state
  title="Application error"
  message="An unexpected error occurred. Our team has been notified."
  [showDetails]="true"
  [details]="errorStack"
  (onRetry)="reload()"
></app-error-state>
```

## Component API

### Inputs

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `title` | `string` | `'Something went wrong'` | Error title text |
| `message` | `string?` | `undefined` | Error message/description |
| `errorCode` | `string?` | `undefined` | Optional error code to display |
| `primaryActionLabel` | `string` | `'Retry'` | Label for primary action button |
| `secondaryActionLabel` | `string` | `'Contact support'` | Label for secondary action button |
| `showDetails` | `boolean` | `false` | Show technical details section |
| `details` | `string?` | `undefined` | Technical details text (shown when expanded) |

### Outputs

| Event | Type | Description |
|-------|------|-------------|
| `onRetry` | `EventEmitter<void>` | Emitted when primary/retry button is clicked |
| `onSecondary` | `EventEmitter<void>` | Emitted when secondary button is clicked |

## Styling Notes

- **Color Palette**: Calm rose colors (not aggressive red)
  - Background: `bg-rose-50`
  - Border: `border-rose-200`
  - Text: `text-rose-700`
- **Primary Button**: Rose primary (`bg-rose-700 text-white hover:bg-rose-800`)
- **Secondary Button**: Outlined (`border-rose-300 text-rose-700 hover:bg-rose-50`)
- **Intercom/Zendesk Style**: Friendly, helpful, non-scary error presentation
- **Responsive**: Buttons stack vertically on mobile
- **Technical Details**: Collapsible section with monospace font for error details

## Best Practices

1. **Always provide a recovery path**: Include at least one action button
2. **Use clear, friendly language**: Avoid technical jargon in the main message
3. **Include error codes**: Helpful for support teams when users contact support
4. **Technical details**: Use `showDetails` for stack traces or detailed error info
5. **Empty safe**: Component handles missing message gracefully

## Accessibility

- Semantic HTML structure
- Proper button roles and ARIA attributes
- Keyboard navigation support
- Focus states for all interactive elements
- `aria-expanded` for collapsible details section
