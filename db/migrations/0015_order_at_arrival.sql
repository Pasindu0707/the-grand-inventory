-- What each delivery found owing on its order, kept as it was that day.
--
-- A delivery against an order could only be read against the order as it
-- stands now. Order no. 4 asked for three boxes of couverture; delivery 308
-- brought two, one went back for a credit, and delivery 309 brought the third.
-- By the time anybody looked, the order said "nothing outstanding", 308's
-- report said "0 still to come", and the third box on 309 looked like the
-- credited one coming back. Nothing on record said that 308 had left a box
-- owing.
--
-- So every delivery against an order writes one row per order line: what was
-- ordered, what was still owed when the lorry arrived, what came, what went
-- back (and how much of that was credited), and anything beyond what was owed.
-- These rows are a record of that moment and are never updated afterwards.
--
-- Over-delivery stays allowed -- the goods are physically there -- but it is
-- no longer silent: the delivery is flagged for management, which is where a
-- resent box that was already credited gets noticed.

begin;

create table grn_order_lines (
    grn_id                bigint not null references grn(id),
    po_line_id            bigint not null references purchase_order_lines(id),
    qty_ordered_base      numeric(14,3) not null,
    -- Ordered, less what earlier deliveries brought and what credits took off.
    qty_owed_before_base  numeric(14,3) not null,
    qty_received_base     numeric(14,3) not null default 0,
    -- Sent back at the door, either outcome.
    qty_refused_base      numeric(14,3) not null default 0,
    -- The part of the refusal settled by a credit note, so no longer owed.
    qty_credited_base     numeric(14,3) not null default 0,
    -- Came on top of what was owed: received plus refused, beyond owed_before.
    qty_over_base         numeric(14,3) not null default 0,
    is_demo               boolean not null default false,
    primary key (grn_id, po_line_id)
);
create index on grn_order_lines (po_line_id);

-- Rebuild the record for deliveries already taken against orders, by replaying
-- them in the order they arrived. Credits come only from refusals at the door,
-- and no order holds the same item on two lines, so each delivery line maps to
-- exactly one order line by item.
do $$
declare
    g record;
    l record;
    v_received numeric;
    v_refused  numeric;
    v_credited numeric;
    v_owed     numeric;
begin
    create temp table run (po_line_id bigint primary key, received numeric, credited numeric)
        on commit drop;

    for g in
        select id, po_id, received_at, is_demo from grn where po_id is not null order by received_at, id
    loop
        for l in
            select pl.id, pl.item_id, pl.qty_base
              from purchase_order_lines pl
             where pl.po_id = g.po_id
               and (pl.voided_at is null or pl.voided_at > g.received_at)
        loop
            insert into run values (l.id, 0, 0) on conflict do nothing;

            if l.item_id is not null then
                select coalesce(sum(gl.qty_packs * p.qty_in_stock_unit), 0) into v_received
                  from grn_lines gl join item_packs p on p.id = gl.item_pack_id
                 where gl.grn_id = g.id and p.item_id = l.item_id;
            else
                select coalesce(sum(o.qty), 0) into v_received
                  from grn_other_lines o
                 where o.grn_id = g.id and o.po_line_id = l.id;
            end if;

            select coalesce(sum(r.qty_base), 0),
                   coalesce(sum(r.qty_base) filter (where r.outcome = 'credit'), 0)
              into v_refused, v_credited
              from grn_rejections r
             where r.grn_id = g.id and r.po_line_id = l.id;

            select greatest(0, l.qty_base - run.received - run.credited) into v_owed
              from run where run.po_line_id = l.id;

            if v_owed > 0 or v_received > 0 or v_refused > 0 then
                insert into grn_order_lines
                    (grn_id, po_line_id, qty_ordered_base, qty_owed_before_base,
                     qty_received_base, qty_refused_base, qty_credited_base, qty_over_base, is_demo)
                values
                    (g.id, l.id, l.qty_base, v_owed, v_received, v_refused, v_credited,
                     greatest(0, v_received + v_refused - v_owed), g.is_demo);
            end if;

            update run
               set received = run.received + v_received,
                   credited = run.credited + v_credited
             where run.po_line_id = l.id;
        end loop;
    end loop;
end $$;

-- Deliveries that brought more than was owed go to management, like refusals.
update grn set needs_review = true
 where not needs_review
   and id in (select grn_id from grn_order_lines where qty_over_base > 0);

commit;
