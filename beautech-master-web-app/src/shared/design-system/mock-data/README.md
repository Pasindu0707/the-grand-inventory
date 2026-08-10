# Mock data (`mock-data/`)

**Purpose:** fake copy, lists, and UI strings used **only** by `sample-ui/` (the `/dev/design-system` gallery).  
Reusable components under `components/` stay **presentational** — they do not import this folder.

## Files

| File | Used by |
|------|---------|
| `gallery-page.mock.ts` | Page title, description, nav links, toast feedback strings |
| `gallery-sections.mock.ts` | Section headings and blurbs for each gallery block |
| `status-badge-demo.mock.ts` | Status / meta preview values |
| `kpi-gallery.mock.ts` | KPI tile row data (`*ngFor`) |
| `form-header-demo.mock.ts` | Form header demo bindings |
| `empty-state-demo.mock.ts` | Empty state panel |
| `error-state-demo.mock.ts` | Error state panel |
| `code-snippets.mock.ts` | Copy-to-clipboard strings (status, KPI, form, empty, error, **table**; table uses `TABLE_DEMO_UI_MOCK`) |
| `table-demo.mock.ts` | Table rows builder, caption/empty copy, row menu model |

## Rules

1. **Never import** from `mock-data/` in production feature modules.
2. **Naming:** `*.mock.ts` for easy grep and review.
3. **New demos:** add a `*-demo.mock.ts` (or extend an existing one), then bind from `design-system-samples` or a dedicated sample component only.
