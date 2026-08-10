# Design system kit — AI and developer rules

**Scope:** Everything under `src/shared/design-system/` (`components/`, `mock-data/`, `sample-ui/`).

**Purpose:** Keep reusable UI consistent, portable, and easy for humans and AI to extend. Team members can attach **`@src/shared/design-system/AGENTS.md`** (or this file) in Cursor when generating or refactoring kit components.

---

## Relationship to the wider app

- **Inside this folder:** Follow **this file** first (kit layout, mocks, gallery).
- **Feature pages and app shell** (outside `design-system/`): Follow your **repository’s main UI / AGENTS** document if you have one at the project root — same stack (PrimeNG, Heroicons, Tailwind, responsive rules) should still apply so the kit matches production screens.

---

## 1. Mandatory stack (kit components)

1. **Angular** — Standalone components unless the host app standard says otherwise.
2. **PrimeNG** (`^19`) — Use PrimeNG for tables, dialogs, buttons, skeletons, menus, etc. when the widget fits. Do not add another component library without approval.
3. **Icons** — **`@ng-icons/heroicons`** (`NgIcon` + `provideIcons` on the host or component). Prefer Heroicons for **new** kit UI. If a legacy snippet still shows `pi pi-*`, align new work with Heroicons.
4. **TailwindCSS** — Layout, spacing, typography, borders, responsive breakpoints (`sm:`, `md:`, `lg:`, `xl:`). No fixed “desktop only” outer widths.
5. **Charts** — Only in demos if needed; use **ApexCharts** in real app pages per your org standard (not required inside every kit primitive).

---

## 2. Folder contract (do not break this)

| Folder | Role |
|--------|------|
| **`components/`** | Reusable **presentational** UI: `@Input` / `@Output`, templates, optional local SCSS. **No HTTP** or **stores**. **Do not import `mock-data/`** except the packaged gallery table: `components/table/design-system-table.component.ts` (binds `table-demo.mock.ts` for `/dev/design-system` only). |
| **`mock-data/`** | Simple **JSON-like** fixtures: `*.mock.ts` (plain objects/arrays). **Gallery and Storybook only.** |
| **`sample-ui/`** | **`DesignSystemSamplesComponent`** and small demo hosts (e.g. table sample). **May** import `components/` + `mock-data/`. |

**Hard rule:** Production feature modules must **never** import `mock-data/`. They import **`components/`** (or a path alias you define).

---

## 3. When AI (or a dev) adds a **new kit component**

1. **Place** the standalone component under `components/<name>/` (selector prefix `app-`, kebab-case folder).
2. **API** — Prefer explicit `@Input()` names and optional `@Output()` events; document defaults in the component class.
3. **Styling** — Tailwind-first; component SCSS only when Tailwind is awkward. Match existing kit tone: white cards, slate text, subtle borders, finance/ERP feel (calm, not flashy).
4. **Icons** — Register needed Heroicons with `provideIcons({ ... })` on the **sample host** or on the component if it is self-contained.
5. **PrimeNG** — Import only the modules that component needs; avoid pulling half the catalog into a tiny widget.
6. **Responsive** — Mobile-first: stacking, `min-w-0`, scroll regions for wide tables, comfortable tap targets.
7. **Accessibility** — Semantic headings/buttons, `aria-label` on icon-only controls, keyboard-friendly triggers.

---

## 4. When AI adds a **gallery preview** (`/dev/design-system`)

1. Add **`mock-data/<feature>-demo.mock.ts`** — small, readable, copy-paste-friendly objects (like JSON).
2. **Bind** the new section from `sample-ui/design-system-samples.component.*` (or a dedicated `*-sample.component.ts` if the demo is large).
3. Optionally add a **short markup snippet** for copy-to-clipboard (see `mock-data/code-snippets.mock.ts` pattern).
4. Update **`mock-data/README.md`** table row so others discover the new file.

Do **not** wire real APIs in the gallery.

---

## 5. Copying this folder to another Angular repo

1. Copy the entire **`design-system/`** directory.
2. Fix **imports** (relative paths or a `tsconfig` path alias, e.g. `@design-system/*`).
3. Install peers: **Angular**, **PrimeNG**, **Tailwind**, **`@ng-icons/core`**, **`@ng-icons/heroicons`**, plus any CDK bits the samples use (e.g. Clipboard).
4. Register **`provideAnimations()`** / theme the same way as the donor app if components rely on it.
5. Mount **`DesignSystemSamplesComponent`** on a dev route and verify the gallery.

---

## 6. Command shortcuts (for Cursor / AI)

Use these prompts with this file in context:

```text
Add a new design-system component following AGENTS.md in src/shared/design-system
```

```text
Add a gallery section for <ComponentName> using mock-data only; no feature imports
```

```text
Refactor this kit component for responsive layout; keep public inputs/outputs stable
```

---

## 7. Quality checklist (before merge)

- [ ] Component has **no** `mock-data/` import.
- [ ] Gallery section uses **mocks only** for labels and sample rows.
- [ ] Layout works at **narrow** and **wide** widths without whole-page horizontal scroll (except intentional inner scroll).
- [ ] New icons use **Heroicons** + `provideIcons` where needed.
- [ ] `ng build` (or CI) passes for the host app.

---

## 8. Further reading in this folder

- [`README.md`](./README.md) — High-level map and portability table.
- [`mock-data/README.md`](./mock-data/README.md) — Mock file list and naming rules.
- [`sample-ui/README.md`](./sample-ui/README.md) — Sample route and file roles.
