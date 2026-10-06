-- Sending bad goods back on the same lorry, and telling management about it.
--
-- CR-010. The supplier-return flow (0007, 0008) is for goods the store finds
-- bad later: they go to quarantine, management decides, they go back. None of
-- that fits the moment at the door, when the driver is standing there and the
-- bottom of the sack is wet. The storekeeper refuses those packs there and then,
-- they leave on the lorry they came on, and they never enter stock -- so there
-- is nothing for the ledger to do and nothing for anybody to approve first.
--
-- What does need doing is twofold:
--
-- 1. Saying what the supplier owes for them. Per refused line, the storekeeper
--    says which: a replacement (the order keeps waiting for it) or a credit
--    note (the order stops waiting, and management records the note number
--    when it arrives).
--
-- 2. Telling management. A delivery that came with refusals, or that left
--    things still to come on its order, is flagged for review. Management sees
--    a count of unseen ones until each has been read.

begin;

create table grn_rejections (
    id              bigserial primary key,
    grn_id          bigint not null references grn(id),
    -- The order line the goods were sent against. Refusing at the door is
    -- always against an order: it is what says what the supplier owes.
    po_line_id      bigint not null references purchase_order_lines(id),
    -- A stock item, in the pack it was ordered in -- or a product ordered by
    -- name (0010), which has neither.
    item_id         int references items(id),
    item_pack_id    int references item_packs(id),
    description     text,
    unit            text,
    qty_packs       numeric(14,3) not null check (qty_packs > 0),
    -- Stock units for an item; the count as typed for a named product.
    qty_base        numeric(14,3) not null check (qty_base > 0),
    reason_code     text not null references reason_codes(code),
    note            text,
    outcome         text not null check (outcome in ('replacement', 'credit')),
    -- Filled in by management when the supplier's credit note arrives.
    credit_note_no  text,
    credit_recorded_by int references users(id),
    credit_recorded_at timestamptz,
    is_demo         boolean not null default false,
    constraint grn_rejections_item_or_named
        check ((item_id is null) = (item_pack_id is null) and (item_id is null) = (description is not null))
);

create index on grn_rejections (grn_id);
create index on grn_rejections (po_line_id);

-- A credit takes that much off the order: the supplier is not sending it.
alter table purchase_order_lines
    add column qty_credited_base numeric(14,3) not null default 0;

comment on column purchase_order_lines.qty_credited_base is
    'Refused at the door and settled by credit note. No longer outstanding.';

-- The delivery report.
alter table grn
    add column needs_review    boolean not null default false,
    add column reviewed_by     int references users(id),
    add column reviewed_at     timestamptz;

comment on column grn.needs_review is
    'Set when the delivery came with refusals, or left something outstanding on its order. Management reads it.';

create index on grn (location_id) where needs_review and reviewed_at is null;

commit;
