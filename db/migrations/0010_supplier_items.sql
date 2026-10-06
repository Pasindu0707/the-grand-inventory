-- What each supplier delivers, and purchase orders that start from it.
--
-- CR-008. A purchase order used to start from the item and end, optionally,
-- with a supplier -- "Who from? - if you know" at the bottom of the last step.
-- That is backwards from how the week's ordering is done: you ring Ceylon
-- Provisions, go down what they bring, and say how much of each. So an order
-- now starts with the supplier and offers what that supplier delivers.
--
-- That list used to be implied by `supplier_prices`, which went with costing in
-- 0009. It is now its own table, kept by the admin on the Suppliers screen, and
-- added to whenever an order includes something that was not on it yet -- the
-- supplier evidently delivers it, so next week it is on the list.
--
-- A supplier also sells things the item master does not know about: a gas
-- regulator, a replacement mixer blade. Those are typed in by name. They can be
-- ordered and remembered against the supplier, but they are not stock: nothing
-- about them goes through the ledger, and a delivery of one is not a GRN line.

begin;

create table supplier_items (
    id            serial primary key,
    supplier_id   int not null references suppliers(id),
    -- Exactly one of these. An item from the item master, or a product typed in
    -- by name that the item master does not have.
    item_id       int references items(id),
    name          text,
    -- For a named product only: what it is counted in ("box", "each").
    unit          text,
    added_by      int references users(id),
    added_at      timestamptz not null default now(),
    is_demo       boolean not null default false,
    constraint supplier_items_item_or_name check ((item_id is null) <> (name is null)),
    constraint supplier_items_unit_for_named check (item_id is null or unit is null)
);

create unique index supplier_items_supplier_item
    on supplier_items (supplier_id, item_id) where item_id is not null;
create unique index supplier_items_supplier_name
    on supplier_items (supplier_id, lower(name)) where item_id is null;
create index on supplier_items (item_id);

-- ── Order lines for products that are not stock items ─────────────────────
--
-- `item_id` becomes optional; a line without one carries the name and unit it
-- was ordered by. For those lines `qty_packs` and `qty_base` both hold the
-- quantity as typed: there is no pack to convert through and nothing for it to
-- be converted into. Receipt and the purchasing reports only follow lines that
-- have an item, because only those can arrive on a GRN.

alter table purchase_order_lines
    alter column item_id drop not null,
    add column description text,
    add column unit        text,
    add constraint purchase_order_lines_item_or_description
        check ((item_id is null) <> (description is null));

commit;
