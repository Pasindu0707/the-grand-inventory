# The Grand — inventory system, build pack

Pilot site: The Grand Gastrobar, Negombo. Inventory only, no POS.

## Files

| File | What it is |
|---|---|
| `db/migrations/0001_init.sql` | Postgres schema. Append-only `stock_ledger` with update/delete/truncate triggers. |
| `db/reset.sql` | Deletes every `is_demo` row before go-live. |
| `seed/items.csv` | 100-item master. Also the Phase 0 template for real data. |
| `seed/generate.ts` | Deterministic generator → `seed.sql`. |
| `seed.sql` | Generated: 60 days of demo movements, ~10,800 ledger rows. Not in git. |
| `docker-compose.yml` | Local Postgres 16 on port **5433**. |

```bash
docker compose up -d
npm install
npm run db:reset-all
```

`db:reset-all` drops the schema, migrates, regenerates `seed.sql` and loads it.
To check the whole cycle including cutover:

```bash
npm run db:verify
```

Same PRNG seed every run, so screenshots and test assertions stay stable.

The generator is TypeScript run through `tsx`. The bare
`node --experimental-strip-types` form needs Node 22+; this repo targets the
Node 20 LTS that is actually installed.

**Demo login:** every seeded user has PIN `1234`, bcrypt-hashed with a fixed
salt so `seed.sql` stays byte-identical between runs. Demo data only — real PINs
are set through the API with a random salt.

## The demo-data contract

Every table has `is_demo boolean`. Demo rows are written with `true`, real rows
with `false`. Nothing else distinguishes them — same tables, same code paths, so
you are never testing against a structure you won't ship.

Cutover is: `psql -f reset.sql`, then import the real item master from the same
CSV shape. The schema does not change.

Do not let real data in before reset. Once a real GRN exists you cannot
`delete from stock_ledger` — the immutability rules block it, which is the
point.

## Planted anomalies

Test data with no faults in it teaches you nothing. Five faults are planted, and
each maps to a report that must catch it. If a report can't find its fault, the
report is wrong.

| # | Fault | Where it hides | Report that must catch it |
|---|---|---|---|
| A | Chicken breast over-issued from day 20 | Issues look normal individually | Theoretical vs actual usage — issued/day steps 4,403 g → 5,116 g (**+16.2%**) with no rise in production |
| B | Two gin bottles vanish, days 28 and 44 | No document at all | Bar weekly count — 750 ml gap, surfacing at the counts on **2026-07-12** and **2026-07-26** |
| C | Sunflower oil +32% at the supplier on day 35 | Buried in a routine GRN | Supplier price movement — 45,880 → 60,561.60 on the next delivery, **2026-07-30** |
| D | Lettuce spoilage spike, days 38–44 | Genuine waste, correctly logged | Wastage by reason — must read as spoilage, **not** flag as theft |
| E | Prawns hit zero on day 41 | Store empties mid-service | Stock-out / below-reorder alert — balance reaches exactly 0 on **2026-07-21** |

B and C both surface later than they occur, and that is the point. The gin
leaves on days 28 and 44 but nothing reveals it until the next Sunday bar count.
The supplier raises the oil price on day 35, but you only find out at the next
delivery. A report that insists on flagging things the day they happen would
miss both.

D is the important one. A variance report that screams about lettuce is a report
the owner will stop opening by week three.

## Phase 2 without a POS

Original plan used POS sales to drive theoretical consumption. With no POS, the
driver is `production_log`: each section declares daily output ("42 chocolate
cakes, 180 fish buns"), the system explodes it through `recipe_lines`, and
compares theoretical ingredient usage against what was actually issued.

This works well for bakery and prepped items, which is most of the volume.
À-la-carte kitchen items are weaker — a chef won't log every plate — so those
stay on issue-vs-count control. That is why `is_critical` and the daily count
carry more weight here than they would in a POS-connected build.

Bar is the strongest case: spirits are countable by bottle and millilitre, which
is exactly why anomaly B is detectable at all.

## Phases

**Phase 0 — 2 weeks, no code.** Walk the store with the storekeeper. Confirm
every item, unit, and pack conversion in `items.csv`. Agree par levels. This is
the phase that decides whether the system is trusted.

**Phase 1 — ~5 weeks.** GRN, market purchase, issue, wastage, count, variance,
low-stock alerts, cleaning module. Goal: know what is in the store and who took
it. No recipes yet.

**Phase 2 — ~4 weeks.** Products, recipes, production log, theoretical vs actual.

**Phase 3 — Purchasing.** POs, approval limits, supplier price comparison.

**Phase 4 — Replication.** Espresso Bar → Coffee Lounge (24-hour site: business
day runs 04:00–04:00, `locations.day_start` already handles this, plus a shift
handover count) → Katuneriya → banquet.

## Build notes

- **Never write to `stock_ledger` from a controller.** One service function per
  document type; the document is the API, the ledger is a consequence.
- **Corrections are reversals.** New row, `is_reversal = true`, `reverses_id`
  set. The rules in `schema.sql` enforce this at the database, not in TS.
- **Everything in `stock_unit`.** Packs convert at entry, once. If grams reach a
  UI field the user typed into, something is wrong.
- **Cash market purchases need a photo.** Make it required in the form. It is
  the only evidence that exists for those buys.
- **Issue windows, not an always-open store.** 06:00, 11:00, 17:00. This is a
  process rule the software should enforce by warning, not blocking.

## Not in scope

Real-time depletion per plate. Barcode scanning on vegetables. Supplier
portals. Demand forecasting. Each gets requested; each kills adoption.
