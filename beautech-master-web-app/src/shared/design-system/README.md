# `src/shared/design-system`

Company-internal **UI kit**: standalone Angular components, **mock data for demos only**, and a **sample gallery** so every project can match the same AcctoGo-style UI.

**AI and developers:** use **[`AGENTS.md`](./AGENTS.md)** in this folder as the primary ruleset when creating or changing anything here (attach it in Cursor for consistent kit output).

## Recommended workflow (senior / team lead)

1. **Single source of truth** — Put *all* shared presentational components here (`components/`). Feature apps import from this folder (or a path alias), not duplicated copies.
2. **Style layer** — “Look and feel” comes from **Tailwind** + your **global SCSS** (e.g. PrimeNG overrides, `custom-table-header`). Copy `design-system` **and** the same Tailwind + global token setup into each new repo, or extract tokens into a small shared SCSS package later.
3. **Mocks stay isolated** — Use `mock-data/*.mock.ts` **only** for `/dev/design-system` and Storybook-style demos. **Never** import mocks from production feature modules (see [`mock-data/README.md`](./mock-data/README.md)).
4. **New Angular app** — Copy the whole `design-system/` tree → add `tsconfig` path e.g. `@company/ui` → `src/shared/design-system/components` → install peers (Angular, PrimeNG, `@ng-icons`, Tailwind) → register `provideIcons` / PrimeNG theme → wire one route to `DesignSystemSamplesComponent` to verify the kit.
5. **Scale up (optional)** — When you outgrow copy-paste, publish this folder as a **private npm package** (`@yourco/ui-kit`) and version it; keep the same public API (component selectors + inputs).

## Can you copy this folder to a new project?

**Mostly yes**, with these expectations:

| You get | You still need in the target app |
|--------|-----------------------------------|
| Component TS/HTML/SCSS | **Angular 19+**, **PrimeNG** (where used), **Tailwind** (utility classes), **`@ng-icons/core` + `@ng-icons/heroicons`** for `NgIcon` / `provideIcons` |
| Status badge logic + optional JSON defaults | Wire `StatusUiConfigService` / `initializeStatusUiDefaultsFactory` if you use catalog defaults (see `components/status-badge/`) |
| Table snippet | `p-table` + related PrimeNG modules (see live sample in `sample-ui/`) |

Copy **this entire folder** (`design-system/`) and adjust **import paths** in your new repo (or add a `tsconfig` path alias such as `@design-system/*` → `src/shared/design-system/*`).

**Duplicate components:** This repo also has `src/app/common/reusable-components/` versions of some widgets (e.g. `form-header`, `kpi-card`). Prefer **one canonical location** per project to avoid drift; either migrate app imports to `design-system` or treat `design-system` as the source of truth and re-export from `common/`.

## Live sample page

After routing is configured (see `app.routes.ts` in this repo), open:

**`/dev/design-system`**

Sections: **Table**, **Status badge**, **KPI card**, **Form header**, **Empty & error states**, with copy-to-clipboard snippets where helpful.

## Contents

| Path | Description |
|------|-------------|
| [`components/status-badge/`](./components/status-badge/) | `app-status-badge`, tone resolution, storage helpers |
| [`components/empty-state/`](./components/empty-state/) | Empty list / panel placeholder |
| [`components/error-state/`](./components/error-state/) | Failed load / retry UI |
| [`components/form-header/`](./components/form-header/) | Section header with Heroicon chip |
| [`components/kpi-card/`](./components/kpi-card/) | Dashboard KPI tile |
| [`components/table/`](./components/table/) | Reference `index.html` + live demo `design-system-table.component.ts` (`mock-data/table-demo.mock`) |
| [`mock-data/`](./mock-data/README.md) | **Gallery-only** fixtures (`*.mock.ts`); all sample bindings and copy-paste snippets flow from here |
| [`sample-ui/`](./sample-ui/README.md) | `DesignSystemSamplesComponent` + lazy table demo |

## Imports in this repo

Samples use **relative imports** (e.g. `../components/status-badge/status-badge.component`). The old README mention of `@vexo/status-badge` is **not** configured in root `tsconfig.json`; use relative paths or add your own path alias when you copy the folder.
