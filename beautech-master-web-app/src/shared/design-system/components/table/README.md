# Table pattern

| File | Role |
|------|------|
| `index.html` | **Reference markup** for copy-paste (not compiled). |
| `design-system-table.component.ts` | **Live demo** — standalone `p-table` wired to `mock-data/table-demo.mock.ts` (gallery only). |

- Import **`DesignSystemTableComponent`** (`selector: app-design-system-table`) from the gallery host, or read this folder’s TS + `index.html` when building a real feature table.
- Follow project **table / AGENTS** rules for caption layout, `#emptymessage`, `#loadingbody`, and `app-status-badge` in the status column.
- Prefer **`ng-icon`** + Heroicons for icons in new work.
