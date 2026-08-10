-- The Grand — inventory schema (Postgres)
-- Design rule: stock_ledger is append-only. Nothing is ever UPDATEd or DELETEd.
-- Corrections are new rows with is_reversal = true pointing at the original.

-- ---------------------------------------------------------------------------
-- 1. Master data
-- ---------------------------------------------------------------------------

create table locations (
  id            serial primary key,
  code          text not null unique,          -- GB, ESP, TCL, KAT, BANQ
  name          text not null,
  day_start     time not null default '06:00', -- business-day cut-off
  is_active     boolean not null default true,
  is_demo       boolean not null default false
);

-- A section is anywhere stock can sit. The main store is a section too:
-- that keeps every movement a section-to-section transfer and removes all
-- special-casing from the ledger.
create table sections (
  id            serial primary key,
  location_id   int not null references locations(id),
  code          text not null,                 -- STORE, KITCHEN, BAR, BAKERY, CLEAN
  name          text not null,
  is_store      boolean not null default false,
  is_demo       boolean not null default false,
  unique (location_id, code)
);

create type user_role as enum
  ('owner','manager','storekeeper','chef','bar','baker','cleaning','purchasing');

create table users (
  id            serial primary key,
  location_id   int references locations(id),  -- null = group-wide (owner)
  name          text not null,
  phone         text,
  role          user_role not null,
  pin_hash      text not null,                 -- 4-6 digit PIN, bcrypt
  is_active     boolean not null default true,
  is_demo       boolean not null default false
);

create table suppliers (
  id            serial primary key,
  name          text not null,
  phone         text,
  is_cash_market boolean not null default false, -- fish market, pola: no invoice
  vat_no        text,
  payment_terms text,
  is_active     boolean not null default true,
  is_demo       boolean not null default false
);

create type storage_type as enum
  ('dry','chiller','freezer','bar','chemical','packaging','gas');

create table item_categories (
  id            serial primary key,
  name          text not null unique,
  storage       storage_type not null
);

create table items (
  id             serial primary key,
  code           text not null unique,          -- DRY-0007
  name           text not null,
  name_si        text,                          -- reserved; UI is English for now
  category_id    int not null references item_categories(id),
  stock_unit     text not null,                 -- g, ml, ea  -- ALWAYS the small unit
  par_level      numeric(14,3) not null default 0,   -- in stock_unit
  reorder_point  numeric(14,3) not null default 0,
  shelf_life_days int,
  is_critical    boolean not null default false, -- true => counted daily
  is_active      boolean not null default true,
  is_demo        boolean not null default false
);

-- One item can be bought in several pack sizes. Never store a conversion
-- factor on the item itself: sugar arrives in 1 kg packs AND 50 kg sacks.
create table item_packs (
  id            serial primary key,
  item_id       int not null references items(id),
  pack_name     text not null,                 -- "50 kg sack"
  qty_in_stock_unit numeric(14,3) not null,    -- 50000
  is_default_purchase boolean not null default false,
  is_demo       boolean not null default false
);

create table supplier_prices (
  id            serial primary key,
  supplier_id   int not null references suppliers(id),
  item_pack_id  int not null references item_packs(id),
  price         numeric(14,2) not null,
  effective_from date not null,
  is_demo       boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 2. The ledger
-- ---------------------------------------------------------------------------

create type doc_type as enum
  ('grn','market','issue','return','wastage','transfer','count','production','opening');

create table reason_codes (
  code          text primary key,
  doc           doc_type not null,
  label         text not null
);

create table stock_ledger (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  business_date date not null,                 -- derived from location.day_start
  location_id   int not null references locations(id),
  section_id    int not null references sections(id),
  item_id       int not null references items(id),
  qty_base      numeric(14,3) not null,        -- SIGNED, in item.stock_unit
  unit_cost     numeric(14,4) not null,        -- weighted average at time of move
  doc           doc_type not null,
  doc_id        bigint not null,
  doc_line      int,
  reason_code   text references reason_codes(code),
  created_by    int not null references users(id),
  is_reversal   boolean not null default false,
  reverses_id   bigint references stock_ledger(id),
  note          text,
  is_demo       boolean not null default false
);

create index on stock_ledger (item_id, section_id, business_date);
create index on stock_ledger (business_date, location_id);
create index on stock_ledger (doc, doc_id);

-- Immutability enforced at the database, not in application code.
create rule ledger_no_update as on update to stock_ledger do instead nothing;
create rule ledger_no_delete as on delete to stock_ledger do instead nothing;

create view current_stock as
  select section_id, item_id,
         sum(qty_base) as qty_base,
         sum(qty_base * unit_cost) as value
  from stock_ledger
  group by section_id, item_id;

-- ---------------------------------------------------------------------------
-- 3. Documents (each writes one or more ledger rows)
-- ---------------------------------------------------------------------------

create table grn (                                 -- supplier delivery, has invoice
  id            bigserial primary key,
  location_id   int not null references locations(id),
  supplier_id   int not null references suppliers(id),
  invoice_no    text,
  invoice_date  date,
  received_at   timestamptz not null default now(),
  received_by   int not null references users(id),
  photo_url     text,
  total         numeric(14,2),
  is_demo       boolean not null default false
);

create table grn_lines (
  id            bigserial primary key,
  grn_id        bigint not null references grn(id),
  item_pack_id  int not null references item_packs(id),
  qty_packs     numeric(14,3) not null,
  pack_price    numeric(14,2) not null,
  expiry_date   date,
  is_demo       boolean not null default false
);

create table market_purchase (                     -- cash buy, no invoice
  id            bigserial primary key,
  location_id   int not null references locations(id),
  supplier_id   int references suppliers(id),
  bought_at     timestamptz not null default now(),
  bought_by     int not null references users(id),
  cash_given    numeric(14,2),
  cash_returned numeric(14,2),
  photo_url     text,                              -- photo of the slip is mandatory in UI
  is_demo       boolean not null default false
);

create table market_purchase_lines (
  id            bigserial primary key,
  market_id     bigint not null references market_purchase(id),
  item_id       int not null references items(id),
  qty_base      numeric(14,3) not null,
  total_price   numeric(14,2) not null,
  is_demo       boolean not null default false
);

create table issues (                              -- store -> section
  id            bigserial primary key,
  location_id   int not null references locations(id),
  to_section_id int not null references sections(id),
  requested_by  int not null references users(id),
  issued_by     int references users(id),
  requested_at  timestamptz not null default now(),
  issued_at     timestamptz,
  status        text not null default 'requested', -- requested|issued|cancelled
  is_demo       boolean not null default false
);

create table issue_lines (
  id            bigserial primary key,
  issue_id      bigint not null references issues(id),
  item_id       int not null references items(id),
  qty_requested numeric(14,3) not null,
  qty_issued    numeric(14,3),
  is_demo       boolean not null default false
);

create table wastage (
  id            bigserial primary key,
  location_id   int not null references locations(id),
  section_id    int not null references sections(id),
  item_id       int not null references items(id),
  qty_base      numeric(14,3) not null,
  reason_code   text not null references reason_codes(code),
  photo_url     text,
  logged_by     int not null references users(id),
  logged_at     timestamptz not null default now(),
  approved_by   int references users(id),
  is_demo       boolean not null default false
);

create table transfers (                           -- between outlets (rare)
  id            bigserial primary key,
  from_section_id int not null references sections(id),
  to_section_id   int not null references sections(id),
  item_id       int not null references items(id),
  qty_base      numeric(14,3) not null,
  sent_by       int not null references users(id),
  received_by   int references users(id),
  sent_at       timestamptz not null default now(),
  received_at   timestamptz,
  is_demo       boolean not null default false
);

create table stock_counts (
  id            bigserial primary key,
  location_id   int not null references locations(id),
  section_id    int not null references sections(id),
  count_type    text not null,                     -- daily_critical|weekly_full|monthly_full
  business_date date not null,
  counted_by    int not null references users(id),
  verified_by   int references users(id),
  closed_at     timestamptz,
  is_demo       boolean not null default false
);

create table stock_count_lines (
  id            bigserial primary key,
  count_id      bigint not null references stock_counts(id),
  item_id       int not null references items(id),
  qty_expected  numeric(14,3) not null,            -- frozen from ledger at open
  qty_counted   numeric(14,3) not null,
  variance_value numeric(14,2) not null,
  is_demo       boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 4. Phase 2 — recipes and production (replaces POS sales import)
-- ---------------------------------------------------------------------------

create table products (                            -- what is sold/made
  id            serial primary key,
  location_id   int not null references locations(id),
  code          text not null,
  name          text not null,
  section_id    int not null references sections(id),  -- who makes it
  yield_qty     numeric(14,3) not null default 1,      -- recipe makes this many
  is_active     boolean not null default true,
  is_demo       boolean not null default false,
  unique (location_id, code)
);

create table recipe_lines (
  id            bigserial primary key,
  product_id    int not null references products(id),
  item_id       int not null references items(id),
  qty_base      numeric(14,3) not null,           -- per yield_qty
  is_demo       boolean not null default false
);

create table production_log (
  id            bigserial primary key,
  location_id   int not null references locations(id),
  section_id    int not null references sections(id),
  business_date date not null,
  product_id    int not null references products(id),
  qty_made      numeric(14,3) not null,
  logged_by     int not null references users(id),
  is_demo       boolean not null default false
);

-- Theoretical vs actual: the whole point of Phase 2.
create view usage_variance as
  select p.location_id, p.business_date, rl.item_id,
         sum(rl.qty_base * p.qty_made / pr.yield_qty) as theoretical_qty
  from production_log p
  join products pr on pr.id = p.product_id
  join recipe_lines rl on rl.product_id = p.product_id
  group by p.location_id, p.business_date, rl.item_id;

-- ---------------------------------------------------------------------------
-- 5. Audit
-- ---------------------------------------------------------------------------

create table audit_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  user_id       int references users(id),
  action        text not null,
  entity        text not null,
  entity_id     text,
  before        jsonb,
  after         jsonb
);
