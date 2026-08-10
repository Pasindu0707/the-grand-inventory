# Design system — sample UI

## Route

This app exposes:

**`/dev/design-system`**

Configured in `src/app/app.routes.ts` as a lazy-loaded `loadComponent` under `dev` → `design-system`.

## Files

| File | Role |
|------|------|
| `design-system-samples.component.ts` | Standalone host: imports all primitives, `provideIcons` for section icons, copy snippets |
| `design-system-samples.component.html` | Section layout + in-page nav anchors |
| `../components/table/design-system-table.component.ts` | Live `p-table` demo (mock data); embedded in the gallery |
| `sample-ui.routes.ts` | Optional child-route array if you prefer `loadChildren` instead of `loadComponent` |

## New project checklist

1. Copy `src/shared/design-system/` (or your chosen path).
2. Install peer deps: `primeng`, `@angular/cdk` (clipboard), `@ng-icons/core`, `@ng-icons/heroicons`, Tailwind.
3. Ensure global styles include **PrimeNG** + **table header/body** classes (`custom-table-header`, `custom-table-data`) if you use the table pattern from `AGENTS.md`.
4. Register a route to `DesignSystemSamplesComponent` (or merge `sample-ui.routes.ts` into your router).
5. Add `provideIcons(...)` at app bootstrap **or** per feature for every Heroicon name you pass to `app-form-header` / `ng-icon`.
