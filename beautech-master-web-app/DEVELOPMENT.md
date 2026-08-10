# Development Guide

## Scope
This file documents catalog-management frontend development in `beautech-master-web-app`.

## Module Area
- Feature area: `social-media-platform`
- Main workspace route: `/social-media/catalog-management`
- Folder: `src/app/social-media-platform/catalog-management/`

## Updated Files
- `src/app/social-media-platform/social-media-platform.routes.ts`
- `src/app/layout/components/app.menu.ts`
- `src/app/social-media-platform/catalog-management/catalog-management-page.component.ts`
- `src/app/social-media-platform/catalog-management/catalog-management-page.component.html`
- `src/app/social-media-platform/catalog-management/catalog-management-page.component.scss`
- `src/app/social-media-platform/services/catalog-management.service.ts`
- `src/app/social-media-platform/services/social-media.ts`
- `src/app/social-media-platform/services/constant/api-social-media.ts`
- `src/app/social-media-platform/settings-page/business-client-settings/business-client-settings.component.ts`
- `src/app/social-media-platform/settings-page/business-client-settings/business-client-settings.component.html`

## Implemented UX
0. Business Client + Agent unified workspace:
   - `Tenant Configuration` tab
   - `Account Configuration` tab
   - Separate `Agent` menu removed; `agent` route now opens Business Client in tenant tab mode.
1. Unified Catalog Management page with sections for:
   - Business account context
   - Business catalog controls
   - Branches
   - Catalogs and clone
   - Catalog item batch
   - Delivery zones
   - Channel bindings
   - Publication jobs
2. Optional guide behavior:
   - `Show Guide`/`Hide Guide`
   - Hidden state persisted in `localStorage`
3. Validation-first actions:
   - Buttons disable on invalid state
   - Toast feedback for missing fields
4. Asset binding now uses connected-asset dropdowns (no manual asset id typing).
5. Product item flow now uses candidate picker:
   - Candidate API search/select
   - Auto fills title, brand, currency, price, image
   - Shows available stock preview
   - Optional price/stock override before batch add
6. Delivery-zone copy action:
   - Copy zones from another branch to selected branch.
7. Business Client branch form now supports:
   - full address fields
   - branch geolocation (lat/lng)
   - opening/closing time
   - branch-level payment toggles (COD / bank transfer)
8. One-click branch configuration clone:
   - source branch -> target branch
   - selectable clone options (address/hours/payment/delivery zones)
9. Catalog mapping visibility improvements:
   - joins local catalog items with social mapping rows
   - shows local item -> remote Meta item mapping status per channel
   - filter/search by mapped/unmapped/failed states
   - displays selected integration `metaBusinessId` in catalog context

## Route Resolution Fix
- Folder was normalized to `catalog-management` and route import updated to:
  - `import('./catalog-management/catalog-management-page.component')`
- This resolves intermittent Angular module resolution failures seen with the old folder path.
- Agent merge routing:
  - `/social-media/agent` -> loads `BusinessClientSettingsComponent` (tenant-focused tab).
  - Sidebar navigation now uses `Business Client` as the single configuration entry point.

## Service Contracts Used
- Product-service:
  - `listCatalogItemCandidates(branchId, catalogId, search?, size?)`
  - Existing branch/catalog/item/zone APIs
  - `cloneBranchConfig(targetBranchId, payload)`
- Social-service:
  - `getBusinessCatalogSettings(...)`, `updateBusinessCatalogSettings(...)`
  - Channel binding APIs
  - Publication APIs

## Local Validation
- Build: `npm run build`
- Dev server: `npm start`

## Guardrails
- Keep API integration in services only.
- Keep catalog actions tenant/business scoped.
- Preserve existing PrimeNG + template patterns.
- Do not reintroduce manual asset-id entry in bindings.

## 2026-02 Catalog UI Update

### Catalog Management UI
- Added **Meta Catalog Setup** section in catalog page:
  - List catalogs from social-service
  - Create catalog in Meta
  - Assign selected `meta_catalog_id` to account settings
- Added context card for assigned Meta catalog.
- Publish flow now requires account-level Meta catalog assignment in UI (`canCreatePublication` check).

### Service updates
- `CatalogManagementService` now includes:
  - `listMetaCatalogs(businessAccountId)`
  - `createMetaCatalog(businessAccountId, {name, vertical})`
- `BusinessCatalogSettings` model includes:
  - `metaCatalogId`
  - `metaCatalogName`

## 2026-02-18 Session Handover

### Product edit flow fixes (inventory module)
- Product edit now loads child data properly:
  - identifiers from `GET /product-skus/{skuId}/identifiers`
  - pricing from `GET /product-skus/{skuId}/pricing`
- Added resilient loading so one failing child API does not block the other.
- Fixed pricing date binding (`p-calendar`) by converting API date strings to `Date`.

### Product edit save binding
- Save flow now syncs in sequence:
1. `PUT /product-skus/{id}` for SKU-level fields
2. `PUT /products/{productId}` for product master fields (`itemCode`, `productName`, `isMetaProduct`, etc.)
3. Child sync for identifiers/pricing with create/update/delete diff behavior

### UI/compile fixes
- Fixed `product-view` template compile error (`id` scope issue in pricing action).
- Added pricing delete action binding and implementation in product view.
- Added broader authenticity/condition dropdown values to match backend enum expansion.

### Deployment notes
1. Deploy backend first:
   - `product-service` then `social-service`
2. Rebuild and deploy frontend:
   - `beautech-master-web-app`
3. Smoke checks:
   - open product edit
   - verify type change persists (`PRODUCT`/`SERVICE`)
   - verify identifiers/pricing load and save correctly

## 2026-04 Billing Module Completion

### Scope
Billing and revenue frontend refactor completion in `beautech-master-web-app`.

### Implemented
1. Legacy sales-invoice frontend removed:
   - Deleted `src/app/revenue/` module and routes.
   - Removed app route registration for `revenue`.

2. Billing module implemented and wired:
   - `src/app/billing/components/billing-document-list`
   - `src/app/billing/components/billing-document-detail`
   - `src/app/billing/components/record-payment-dialog`
   - `src/app/billing/components/order-settlement`
   - `src/app/billing/components/billing-payment-list`

3. Shared billing contracts/services:
   - `src/app/shared/interfaces/billing.ts`
   - `src/app/shared/services/billing.service.ts`

4. Navigation and routing:
   - `/billing/documents`
   - `/billing/documents/:id`
   - `/billing/payments`
   - Sidebar updated under `Operations -> Billing`.

### Functional Rules Applied
1. Billing documents:
   - Create/update/deactivate supported.
2. Payments:
   - Manual create (record payment) supported.
   - Generic manual update not exposed.
3. Settlements:
   - No manual create/update.
   - System-calculated + recalculate only.

### Hardening
1. Payment allocation compatibility:
   - Supports `billingDocumentId` with legacy `salesInvoiceId` fallback in reads.
2. Settlement refresh:
   - Billing detail triggers settlement refresh after payment recording.
3. Toast/message wiring:
   - `MessageService` providers and toast hosts added for billing contexts.

### Validation
- Build verified with `npm run build`.
- Remaining build warning is unrelated CommonJS warning (`quill-delta`).

### Additional Module Doc
- See `src/app/billing/README.md` for billing-specific details.
