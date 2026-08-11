# The Grand — inventory system handbook

Everything you need to check the system, understand why it works the way it
does, know who can do what, and add people.

Companion documents: [README.md](README.md) for the data pack,
[PLAN.md](PLAN.md) for the build plan and remaining work.

---

## 1. What this is, in one paragraph

An inventory system for The Grand Gastrobar, Negombo. It answers one question
well: **what is in the store, and who took it.** Every movement of stock is a
row in an append-only ledger that can never be edited or deleted; corrections
are reversals that sit beside the original. Stock levels are not stored
anywhere — they are recalculated from the ledger every time you look, so there
is no cached number that can drift away from the movements that produced it.
There is no POS; consumption is driven by what each section declares it made.

---

## 2. Starting it up

Three things run. All three must be up.

```bash
docker compose up -d          # Postgres on 5433
npm run db:reset-all          # schema + 60 days of demo data
```

```bash
cd api && npm run dev         # API on 3000
```

```bash
cd beautech-master-web-app && npm start   # web on 4200
```

Open **http://localhost:4200**. Every demo user's PIN is **1234**.

**Is it alive?**

| Check | Command | Expected |
|---|---|---|
| Database | `docker compose ps` | `grand_db` healthy |
| API | `curl localhost:3000/api/v1/health` | `{"status":"ok","db":"up","ledgerRows":…}` — 10,995 on a fresh seed, and it only ever grows |
| Web | open `localhost:4200` | login screen with seven faces |
| Web → API | login as anyone | you land on Today with a stock value |

---

## 3. What to check

Work down this list. It is ordered so that a failure early explains failures
later.

### 3.1 The automated suites

These are the fastest way to know the system is sound. Run them first.

```bash
cd api && npm test
```

**Expect 64 passing tests.** They run against a real Postgres, not a mock,
because the things worth testing here — append-only triggers, weighted-average
cost, idempotency races — *are* database behaviour.

```bash
npm run db:verify
```

**Expect 12 passing checks.** This one proves the database itself cannot be
tampered with, and that the cutover script works. If `reset.sql` ever stops
emptying the ledger, this catches it.

### 3.2 The five planted faults

The demo data has five deliberate faults. Each one maps to a report. Sign in as
**Nuwan Perera (manager)** and open **Reports**, with the range covering
2026-06-10 to 2026-08-08.

| Tab | Look for | Correct answer |
|---|---|---|
| Usage variance | Chicken breast | **+18.6%**, ~LKR 192,000 over-issued |
| Shrinkage | Gin - imported | **exactly two rows**, −750 ml each, ~LKR 5,216 each, both BAR |
| Price movement | Sunflower oil | **45,880 → 60,561.60 (+32%)** on 2026-07-30 |
| Wastage | Lettuce | listed under **Spoiled / expired** |
| Stock-outs | Prawns - medium | ran out on **2026-07-21** |

**The most important check on this page is a negative one.** Lettuce must appear
under Wastage and must **not** appear under Shrinkage. If honest, documented
spoilage ever shows up in the unexplained-loss report, the report is wrong — and
an owner who gets accused of theft over a crate of lettuce stops opening reports
by week three.

Equally: **Usage variance should list two or three items, not forty.** A report
that flags most of the store is noise.

### 3.3 The daily flows, by hand

Sign in as **Sunil Fernando (storekeeper)** unless stated.

| # | Do this | It is right when |
|---|---|---|
| 1 | **Receive delivery** → supplier, item, pack, quantity in *packs* | The line shows the stock-unit conversion beneath it, read-only. You never type grams. |
| 2 | Enter a price 40% above the last one, save | It **warns** and still records. It must not block — the lorry has already gone. |
| 3 | Press Save twice quickly | **One** delivery, not two. |
| 4 | **Issues** → new request for the Kitchen, then Fulfil | Store goes down, Kitchen goes up, by the same amount. |
| 5 | Request more than the store holds | It issues what exists and tells you the shortfall. Stock never goes negative. |
| 6 | Fulfil outside 06:00 / 11:00 / 17:00 | It **warns** and records anyway. |
| 7 | **Wastage** → log something without a reason | Save stays disabled. The reason is the point. |
| 8 | **Market purchase** → try to save without a photo | Blocked. A cash buy has no invoice; the photo is the only evidence. |
| 9 | Market purchase with cash given ≠ lines total | Records, and flags the gap. |
| 10 | **Stock count** → start a daily count | **The expected quantity is never shown.** One item per screen. |
| 11 | Enter one item short, finish | Variance appears *after* closing, with a value. |
| 12 | As **Nuwan (manager)**, verify that count | Allowed. As Sunil, verifying your own count is refused. |
| 13 | **Cleaning** → tick a task, tick it again | Second tap refused. One task, once a day. |
| 14 | Refresh the page on any screen | You stay on that screen. |

### 3.4 The things that must be impossible

If any of these succeed, something is badly wrong.

- Editing or deleting a ledger row, by any route, including `TRUNCATE`.
- Reversing the same document twice.
- Cancelling an issue that already moved stock.
- Closing the same count twice.
- Verifying your own count, or your own cleaning.
- A chef opening Reports.
- Changing `x-location-id` to another outlet you are not assigned to.

The database enforces the first one; the API enforces the rest.

---

## 4. The ideas

These are the decisions the whole system rests on. If someone proposes a change
that breaks one of them, it is worth a conversation before saying yes.

### The ledger is append-only, and the database enforces it

Not the application. Postgres triggers reject any `UPDATE` or `DELETE` on
`stock_ledger`, and a `TRUNCATE` guard closes the obvious back door. A
correction is a new row with `is_reversal = true` pointing at the row it undoes.
The original stays exactly where it was.

This is the property that makes the numbers worth trusting. The moment stock
history can be quietly edited, every report becomes an opinion.

### Stock is derived, never stored

There is no `stock_qty` column anywhere. On-hand is `sum(qty_base)` over the
ledger for that item and section, computed on read. A cached quantity is a
number that eventually disagrees with the movements behind it, and nobody can
tell you when it started lying.

### The document is the API; the ledger is a consequence

Controllers never write the ledger. One service function per document type
calls a single private writer. This is enforced by an ESLint rule that fails the
build, not by a comment — a convention lasts until the first person in a hurry.

### The store is just another section

Not a special case. That makes every movement a section-to-section transfer and
removes special-casing from the ledger entirely.

### Everything in the small unit; packs convert once

Grams, millilitres, each. Users enter **packs** — "2 × 20 L can" — because that
is what arrives on the lorry and what the invoice says. The conversion happens
once, on entry, server-side. If grams reach a field a human types into,
something has gone wrong.

### Warn, do not block

Issue windows, price jumps, cash discrepancies: all warn, none block. An issue
that happened at 14:00 happened at 14:00. Refusing to record it does not undo
it — it just makes the stock figure wrong as well as the process.

### Physical reality first, approval second

Wastage and transfers write the ledger the moment stock moves, not when a
manager approves. The food is already in the bin. Withholding the row until
someone is free means the stock figure is knowingly wrong for as long as they
are busy.

### Counts are blind, and frozen at open

The expected quantity is **never shown while counting**. Show a tired
storekeeper that the system expects 4,500 and they will type 4,500 — which
confirms a theft rather than finding it. And expected is frozen when the count
opens: if it were re-read at close, a movement posted while someone walked the
shelves would silently absorb the gap.

### Spoilage and shrinkage are different conversations

Declared waste has a name and a reason on it — a kitchen and ordering problem.
Unexplained loss is a different discussion entirely. They are separate reports
on separate screens, and documented waste is excluded from the loss report by
construction.

### Reports need a materiality floor, in money *and* proportion

Counting is never exact. Without a floor the loss report listed Rs 0.44 of
lettuce. With only a money floor, ordinary counting noise on expensive gin
produced fifteen false alarms that buried the two real bottles. Noise is
proportional to what is on the shelf; theft is not. Both floors are guesses
(Rs 100 and 2%) and belong on the Phase 0 list to confirm with the owner.

### Faults surface when they are discovered, not when they happen

The gin leaves on days 28 and 44 but nothing reveals it until the next Sunday
bar count. The supplier raises the oil price on day 35 but you find out at the
next delivery. A report that insists on same-day detection misses both.

### Demo and real data share every code path

Every table has `is_demo`. Same tables, same queries, same screens. You are
never testing against a structure you will not ship.

---

## 5. Who can do what

**The API is the real gate.** The menu hides what a role cannot use, but the
server is what enforces it. This table is taken from the route definitions.

### Roles

| Role | Who this is |
|---|---|
| `owner` | The proprietor. Group-wide — not tied to one outlet. |
| `manager` | Runs the site. Approves, verifies, reads everything. |
| `storekeeper` | Holds the store. Receives, issues, counts. |
| `chef` / `bar` / `baker` | Section heads. Request stock, log waste, count their own section. |
| `cleaning` | Cleaning staff. |
| `purchasing` | Buying. Reserved for Phase 3 (purchase orders). |

### Write permissions

| Action | owner | manager | storekeeper | chef / bar / baker | cleaning | purchasing |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Receive delivery (GRN) | ● | ● | ● | | | ● |
| Market purchase (cash) | ● | ● | ● | | | ● |
| Request an issue | ● | ● | ● | ● | ● | |
| Fulfil an issue | ● | ● | ● | | | |
| Cancel an issue | ● | ● | ● | | | |
| Log wastage | ● | ● | ● | ● | | |
| **Approve wastage** | ● | ● | | | | |
| Transfer stock | ● | ● | ● | | | |
| Open / close a count | ● | ● | ● | ● | | |
| Enter count lines | ● | ● | ● | ● | ● | ● |
| **Verify a count** | ● | ● | | | | |
| Log cleaning | ● | ● | ● | ● | ● | |
| **Verify cleaning** | ● | ● | | | | |
| **Reverse a document** | ● | ● | | | | |
| Upload a photo | ● | ● | ● | ● | ● | ● |

### Read permissions

| View | Who |
|---|---|
| Stock, items, suppliers, issues, counts, wastage, deliveries, cleaning | **Any signed-in user** |
| **Reports** (all five) | **owner and manager only** |

### Two things to know about this

**Reads are not restricted by role.** Any signed-in person can call the API and
see stock levels or the wastage list. The menu hides screens they have no use
for, but that is presentation, not security. On a shared store-room tablet this
is a reasonable trade; if it ever needs tightening, it is a change to the route
guards, not the UI.

**The owner currently has full write access.** The plan describes the owner as
read-only plus approvals. In the code the owner is on every write route. That
is deliberate for now — the owner is the person who fixes things at 11pm — but
it is a decision worth making consciously rather than inheriting.

### Separation of duties

Three rules the system enforces regardless of role:

- You cannot **verify a count you performed**.
- You cannot **verify cleaning you did**.
- You cannot **approve your own wastage** unless you are a manager or owner.

The value of a second check is entirely that it is a second person.

---

## 6. Adding people

### Right now

There is no user-management screen — see Known gaps. Use the script:

```bash
node scripts/add-user.mjs --list
```

```bash
node scripts/add-user.mjs --name "Kamal Perera" --role chef --pin 4821
```

They appear on the login screen immediately. No restart.

**Options**

| Flag | Meaning |
|---|---|
| `--name` | Full name, as it should appear on the login tile |
| `--role` | One of: `owner manager storekeeper chef bar baker cleaning purchasing` |
| `--pin` | 4–6 digits |
| `--outlet` | Outlet code, default `GB`. Options: `GB ESP TCL KAT BANQ` |
| `--group` | Group-wide instead of one outlet. Use for the owner. |
| `--phone` | Optional |
| `--deactivate` | Removes them from the login screen |
| `--list` | Show everyone |

**Reset a forgotten PIN** — same command, existing name. This also clears any
lockout from failed attempts:

```bash
node scripts/add-user.mjs --name "Sunil Fernando" --pin 5566
```

**Someone leaves:**

```bash
node scripts/add-user.mjs --name "Sunil Fernando" --deactivate
```

Deactivate, never delete. Their name is on every document they ever created and
the ledger does not forget. A deleted user would orphan sixty days of history.

### Choosing a PIN

Four digits on a shared tablet, so treat it as identification rather than a
secret. Five wrong attempts locks the account for fifteen minutes. Avoid `1234`,
birth years, and the last four of a phone number. Everyone gets their own — the
entire audit trail depends on the name against a document being the person who
did it.

### When someone changes job

Give them the new role with the same command; it updates in place.

```bash
node scripts/add-user.mjs --name "Ruwan Dias" --role storekeeper --pin 7788
```

Their history stays attached to them. Documents they created as a baker still
say baker's work — the ledger records what happened, not what is true today.

---

## 7. Adding other master data

**This is currently the weakest part of the system and the main thing standing
between you and go-live.** There is no screen for any of it.

| Thing | How, today |
|---|---|
| People | `scripts/add-user.mjs` ✅ |
| Items, packs, par levels | Edit `seed/items.csv`, re-seed. **No live editing.** |
| Suppliers | SQL only |
| Outlets and sections | SQL only |
| Cleaning areas and tasks | Edit `seed/generate.ts`, re-seed |
| Issue windows | `settings` table, SQL only |

For the pilot this is survivable because the item master is confirmed once in
Phase 0 and then rarely changes. It is **not** survivable long term — a manager
must be able to add a new supplier without a developer. See Known gaps.

---

## 8. Known gaps

Honest list of what is not built.

| Gap | Impact |
|---|---|
| **No user-management screen** | Adding staff needs terminal access. Script exists; UI does not. |
| **No item / supplier management screen** | Master data changes need a developer. Blocks day-to-day autonomy. |
| **No CSV import for cutover** | Phase 0 real-data import is manual. Needed before go-live. |
| **No transfers screen** | API works and is tested; no UI. |
| **Not deployed** | No VPS, no HTTPS, no CI, **no backups, no tested restore**. |
| **No offline support** | Deliberate — you chose online-only. A dropped connection during a count loses it. |
| **Not installable as an app** | Runs in a browser tab. |
| Phase 2 | Recipes and production log — `usage_variance` currently runs on seeded recipes. |
| Phase 3 | Purchase orders, approval limits. The `purchasing` role is a placeholder. |
| Phase 4 | Other outlets. Schema supports them; nothing else does. |

**The one that should worry you most is backups.** There is currently no backup
of anything. Before a single real GRN is entered, there must be a nightly dump
*and* a restore that has actually been performed once. An untested backup is a
belief, not a backup.

---

## 9. Go-live runbook

Do not start this until Phase 0 is finished — every item, unit and pack
conversion confirmed by walking the store with the storekeeper. No amount of
software recovers from a wrong pack conversion.

1. Deploy and confirm backups **and a successful restore**.
2. Freeze demo use. Tell everyone to stop.
3. `psql "$DB" -f db/reset.sql`
4. **Verify**: `select count(*) from stock_ledger;` → must be **0**.
5. Create the real outlet, sections, suppliers and item master.
6. Add real people with `scripts/add-user.mjs`. Delete the demo accounts.
7. Opening count in every section. This becomes the opening balance.
8. First real delivery.

After that first real GRN the ledger is immutable for real. That is the point.

---

## 10. Where things live

```
db/migrations/     schema and its changes
db/reset.sql       the cutover wipe
seed/items.csv     the 100-item master, and the Phase 0 template
seed/generate.ts   demo data generator, including the five planted faults
scripts/           migrate, seed, verify, add-user
api/src/services/  the business rules — ledger.ts is the important one
api/src/routes/    HTTP surface and role guards
api/test/          64 tests; anomalies.test.ts is the acceptance suite
beautech-master-web-app/src/app/pages/    the ten screens
```

If you read one file, read `api/src/services/ledger.ts`. Everything else is
arrangement around what that module guarantees.
