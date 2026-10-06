-- No daily count. Stock is counted weekly and monthly, in full.
--
-- The daily count covered the items flagged critical, on the theory that the
-- fast, expensive lines needed watching every morning. Nobody at The Grand
-- counts daily, so the count type goes, and with it the critical flag, whose
-- only job was to say what the daily count covered.
--
-- The daily counts already recorded were sample data from the generator, so
-- they are removed rather than kept as history -- along with the adjustment
-- rows they posted to the ledger, which would otherwise point at counts that
-- no longer exist. Only demo rows are touched: the ledger guard refuses to
-- delete anything else, and that is the right answer for real counts.

begin;

-- The guard in ledger_guard() lets demo rows go only with this set, and only
-- for this transaction.
set local grand.allow_demo_reset = 'on';

delete from stock_ledger
 where doc = 'count'
   and is_demo
   and doc_id in (select id from stock_counts where count_type = 'daily_critical' and is_demo);

delete from stock_count_lines
 where count_id in (select id from stock_counts where count_type = 'daily_critical' and is_demo);

delete from stock_counts where count_type = 'daily_critical' and is_demo;

-- Anything left that is daily is real and cannot be deleted, so it is filed as
-- the weekly count it now stands for rather than blocking the constraint.
update stock_counts set count_type = 'weekly_full' where count_type = 'daily_critical';

alter table stock_counts
  add constraint stock_counts_count_type_check
  check (count_type in ('weekly_full', 'monthly_full'));

alter table items drop column is_critical;

commit;
