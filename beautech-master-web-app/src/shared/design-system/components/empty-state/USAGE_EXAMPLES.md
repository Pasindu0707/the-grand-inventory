# Empty State Component - Usage Examples

## Basic Usage

### Simple Empty State
```html
<app-empty-state
  title="No conversations yet"
  subtitle="Start a conversation to see it here."
></app-empty-state>
```

### With Icon
```html
<app-empty-state
  icon="pi pi-inbox"
  title="No conversations yet"
  subtitle="Your inbox is empty. New messages will appear here."
></app-empty-state>
```

## Complete Examples

### 1. No Conversations Yet
```html
<app-empty-state
  icon="pi pi-comments"
  title="No conversations yet"
  subtitle="Start engaging with your customers to see conversations here."
  primaryActionLabel="Start Conversation"
  (onPrimaryAction)="startNewConversation()"
></app-empty-state>
```

### 2. No Templates Found (with search query)
```html
<app-empty-state
  icon="pi pi-file"
  title="No templates found"
  [subtitle]="'&quot;' + searchQuery + '&quot; did not match any current templates. Please try again or <u>create a new template</u>.'"
  secondaryActionLabel="Clear search"
  primaryActionLabel="Create template"
  (onSecondaryAction)="clearSearch()"
  (onPrimaryAction)="createTemplate()"
></app-empty-state>
```

### 3. No Connected Accounts
```html
<app-empty-state
  icon="pi pi-link"
  title="No connected accounts"
  subtitle="Connect your social media accounts to get started."
  primaryActionLabel="Connect Account"
  (onPrimaryAction)="openConnectionFlow()"
></app-empty-state>
```

### 4. Card Variant (with background)
```html
<div class="p-6">
  <app-empty-state
    variant="card"
    icon="pi pi-inbox"
    title="No projects found"
    subtitle="Get started by creating your first project."
    primaryActionLabel="Create project"
    (onPrimaryAction)="createProject()"
  ></app-empty-state>
</div>
```

### 4a. Real-World Example: Template Settings Table
```html
<p-table [value]="templates">
  <!-- table templates -->
  
  <ng-template #emptymessage>
    <tr>
      <td colspan="6" class="p-0">
        <div class="py-12">
          <app-empty-state
            variant="card"
            icon="pi pi-file"
            title="No templates found"
            subtitle="Click &quot;Sync&quot; to import templates from Meta or create a new template."
            primaryActionLabel="Sync Templates"
            (onPrimaryAction)="syncTemplates()"
          ></app-empty-state>
        </div>
      </td>
    </tr>
  </ng-template>
</p-table>
```

### 5. With Search Query (like the image)
```html
<app-empty-state
  icon="pi pi-folder"
  title="No projects found"
  [subtitle]="'&quot;' + searchQuery + '&quot; did not match any current projects. Please try again or <u>create a new project</u>.'"
  secondaryActionLabel="Clear search"
  primaryActionLabel="Create project"
  size="md"
  variant="inline"
  (onSecondaryAction)="clearSearch()"
  (onPrimaryAction)="createProject()"
></app-empty-state>
```

### 6. Size Variants
```html
<!-- Small -->
<app-empty-state
  size="sm"
  title="No items"
  subtitle="Add items to get started."
></app-empty-state>

<!-- Medium (default) -->
<app-empty-state
  size="md"
  title="No items"
  subtitle="Add items to get started."
></app-empty-state>

<!-- Large -->
<app-empty-state
  size="lg"
  title="No items"
  subtitle="Add items to get started."
></app-empty-state>
```

### 7. In Table Empty State
```html
<p-table [value]="items">
  <!-- table templates -->
  
  <ng-template pTemplate="emptymessage">
    <div class="py-12">
      <app-empty-state
        icon="pi pi-table"
        title="No data available"
        subtitle="There are no records to display."
        primaryActionLabel="Add Record"
        (onPrimaryAction)="addRecord()"
      ></app-empty-state>
    </div>
  </ng-template>
</p-table>
```

### 8. In Card Container
```html
<div class="bg-white rounded-xl border border-zinc-200 p-6">
  <app-empty-state
    variant="inline"
    icon="pi pi-box"
    title="No items in this category"
    subtitle="Items will appear here once added."
    primaryActionLabel="Add Item"
    (onPrimaryAction)="addItem()"
  ></app-empty-state>
</div>
```

## Component API

### Inputs

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `icon` | `string?` | `'pi pi-inbox'` | PrimeNG icon class (e.g., 'pi pi-inbox', 'pi pi-folder') |
| `title` | `string` | **required** | Main title text |
| `subtitle` | `string?` | `undefined` | Subtitle text (supports HTML, use `[subtitle]` binding for HTML) |
| `primaryActionLabel` | `string?` | `undefined` | Label for primary action button |
| `secondaryActionLabel` | `string?` | `undefined` | Label for secondary action button |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant |
| `variant` | `'card' \| 'inline'` | `'inline'` | Display variant (card has background/border) |

### Outputs

| Event | Type | Description |
|-------|------|-------------|
| `onPrimaryAction` | `EventEmitter<void>` | Emitted when primary button is clicked |
| `onSecondaryAction` | `EventEmitter<void>` | Emitted when secondary button is clicked |

## Styling Notes

- **Primary Button**: Premium black CTA (`bg-zinc-900 text-white hover:bg-zinc-800`)
- **Secondary Button**: Outlined style (`border-zinc-300 text-zinc-700 hover:bg-zinc-50`)
- **Color Palette**: Neutral zinc colors for enterprise look
- **Responsive**: Buttons stack vertically on mobile
- **Subtitle Links**: Use `<u>` tags or `<a>` tags in subtitle for underlined clickable text

## HTML in Subtitle

To include HTML (like underlined links) in the subtitle, use property binding:

```html
<app-empty-state
  title="No results"
  [subtitle]="'Search for &quot;' + query + '&quot; did not match. <u>Try again</u> or <u>clear search</u>.'"
></app-empty-state>
```

## Accessibility

- Semantic HTML structure
- Proper button roles
- Keyboard navigation support
- Focus states for all interactive elements
