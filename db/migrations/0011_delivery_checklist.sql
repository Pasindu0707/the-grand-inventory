-- Receiving a delivery as a checklist against its order.
--
-- CR-009. The delivery screen now opens on the orders that are expected, by
-- supplier; the storekeeper picks one and ticks off what came off the lorry.
-- Two things that could not be said before now can.
--
-- 1. "That item is not coming." An order with nine of its ten lines delivered
--    stays open on the tenth, which is right -- until the supplier says they
--    have none. Until now the only way out was to close the whole order short.
--    Management can now void the one line, with a reason, and the order closes
--    if nothing else is outstanding. The line stays on the order, marked, so
--    the paper trail still shows it was asked for.
--
-- 2. Products ordered by name (0010) can be ticked as arrived. They are still
--    not stock -- nothing reaches the ledger -- but the delivery records that
--    they came, the order stops waiting for them, and they print on the
--    delivery note with everything else.

begin;

alter table purchase_order_lines
    add column voided_at   timestamptz,
    add column voided_by   int references users(id),
    add column void_reason text,
    add constraint purchase_order_lines_void_complete
        check ((voided_at is null) = (voided_by is null) and (voided_at is null) = (void_reason is null));

comment on column purchase_order_lines.voided_at is
    'Set when management takes an undelivered line off the order. Its outstanding balance is no longer waited for.';

-- What arrived on a delivery that is not stock: a product ordered by name.
create table grn_other_lines (
    id           bigserial primary key,
    grn_id       bigint not null references grn(id),
    po_line_id   bigint references purchase_order_lines(id),
    description  text not null,
    unit         text,
    qty          numeric(14,3) not null check (qty > 0),
    is_demo      boolean not null default false
);

create index on grn_other_lines (grn_id);
create index on grn_other_lines (po_line_id);

commit;
