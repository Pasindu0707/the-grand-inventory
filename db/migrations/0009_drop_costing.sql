-- The inventory counts things. It does not price them.
--
-- CR-007. Costing was built in from the first migration: a weighted-average
-- cost per item, the price paid on every GRN line, an estimate on every
-- purchase order line, a value on every count variance, a credit amount on
-- every supplier return, and a supplier price list behind all of it. Reports
-- were sorted by rupees and filtered by rupee thresholds.
--
-- None of it is used. Accounts keep the money in their own system, off the
-- supplier's invoice, and that is the number that gets paid. A second copy of
-- it in the store's tablet is a second number to disagree with, typed in by
-- someone whose job is to check that fifty sacks arrived, not what they cost.
-- An item with a blank or wrong price also made every value in every report
-- quietly wrong, which is worse than not having the column.
--
-- So it comes out. What stays is everything about quantity: what arrived,
-- what was issued, what was counted, what went back and what was binned.
--
-- What is NOT removed:
--   * `grn.invoice_no` / `invoice_date`. They are how a delivery is found
--     again and matched to the paper -- a reference, not a price.
--   * `supplier_returns.credit_note_no` and the `credit` outcome. A supplier
--     that issues a credit note has settled the return, and the note number
--     is what accounts needs to find it. The amount on it is theirs to read.
--
-- Destructive: the dropped prices and costs are gone. Take a backup first if
-- anybody might ever want them.

begin;

-- ── Weighted-average cost ──────────────────────────────────────────────────

drop view if exists current_stock_valued;
drop table if exists item_cost_state;

-- Dropping a column does not fire the row triggers that keep the ledger
-- append-only; those guard rows, and no row is changed here.
alter table stock_ledger drop column if exists unit_cost;

-- ── Supplier price list ────────────────────────────────────────────────────

drop table if exists supplier_prices;

-- ── Documents ──────────────────────────────────────────────────────────────

alter table grn                   drop column if exists total;
alter table grn_lines             drop column if exists pack_price;
alter table purchase_order_lines  drop column if exists est_price;
alter table opening_stock_lines   drop column if exists unit_cost;
alter table stock_count_lines     drop column if exists variance_value;

alter table supplier_returns      drop column if exists credit_value;
alter table supplier_return_lines drop column if exists pack_price;
alter table supplier_return_lines drop column if exists line_credit;

commit;
