-- Wipe all demo data before go-live. Order matters (FK dependencies).
--
-- The ledger delete is only possible because of the escape in ledger_guard():
-- is_demo rows may be removed while this GUC is set, real rows never. The
-- setting is `set local`, so it dies with this transaction and cannot leak
-- into an application session.
--
--   psql "$DB" -f db/reset.sql
--
-- Verify afterwards:  select count(*) from stock_ledger;   -- must be 0

begin;

set local grand.allow_demo_reset = 'on';

delete from stock_ledger        where is_demo;

delete from stock_count_lines   where is_demo;
delete from stock_counts        where is_demo;
delete from opening_stock_lines where is_demo;
delete from opening_stock       where is_demo;
delete from production_log      where is_demo;
delete from supplier_return_lines where is_demo;
delete from supplier_returns    where is_demo;
delete from section_returns     where is_demo;
delete from wastage             where is_demo;
delete from issue_lines         where is_demo;
delete from grn_other_lines     where is_demo or grn_id in (select id from grn where is_demo);
delete from grn_rejections      where is_demo or grn_id in (select id from grn where is_demo);
update grn set reviewed_by = null where reviewed_by in (select id from users where is_demo) and not is_demo;
update grn_rejections set credit_recorded_by = null where credit_recorded_by in (select id from users where is_demo);
delete from grn_lines           where is_demo;
delete from grn                 where is_demo;
-- A GRN entered against a purchase order points at it, and the order points
-- back at the request it came from, so this trio unwinds in that order: the
-- GRN above first, then the order, then the request.
delete from purchase_order_lines where is_demo;
delete from purchase_orders     where is_demo;
delete from issues              where is_demo;
delete from transfers           where is_demo;
delete from recipe_lines        where is_demo;
delete from products            where is_demo;
-- What a supplier delivers points at both the supplier and the item, and
-- anything somebody added by hand to a demo supplier goes with it.
delete from supplier_items      where is_demo
                                   or supplier_id in (select id from suppliers where is_demo)
                                   or item_id in (select id from items where is_demo);
update supplier_items set added_by = null
 where added_by in (select id from users where is_demo);
delete from item_packs          where is_demo;
delete from items               where is_demo;
delete from suppliers           where is_demo;
delete from settings            where location_id in (select id from locations where is_demo);
delete from users               where is_demo;
delete from sections            where is_demo;
delete from locations           where is_demo;

commit;
