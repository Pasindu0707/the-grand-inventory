/**
 * The two weekly and monthly lists.
 *
 * Not analysis: lists. What came in from suppliers this week, and what each
 * section asked the store for and actually got. They are what a manager reads
 * on a Monday morning or files at the end of the month, so they answer in
 * plain totals per supplier and per section, not percentages, and every
 * quantity comes in the pack it arrived in where that is how it is counted.
 *
 * The period is any range, like every other report. The screen offers it as a
 * week (Monday to Sunday) or a calendar month, because those are the two ways
 * anybody here asks.
 */
import { sql } from 'kysely';
import { db } from '../db/index.js';
import type { DateRange } from './reports.js';

// ── What we bought ──────────────────────────────────────────────────────────

export interface PurchaseListRow {
    supplierId: number;
    supplierName: string;
    /** Null for a product ordered by name, which is not stock. */
    itemId: number | null;
    code: string | null;
    name: string;
    /** Stock unit for an item; what a named product is counted in. */
    unit: string | null;
    /** The pack it arrived in. Null for a named product. */
    packName: string | null;
    /** Packs received into stock (or the count, for a named product). */
    qtyPacks: number;
    /** The same in stock units. */
    qtyBase: number;
    /** Packs refused at the door in this period. */
    qtyPacksSentBack: number;
    /** How many separate deliveries it came on. */
    deliveries: number;
}

export interface PurchaseListSummary {
    deliveries: number;
    suppliers: number;
    /** Distinct things bought. */
    lines: number;
    /** Deliveries that had something sent back at the door. */
    deliveriesWithReturns: number;
    /** Purchase orders raised in the period. */
    ordersRaised: number;
}

/**
 * Everything received from suppliers in the period, by supplier and item.
 *
 * Read from deliveries rather than orders: an order is a wish, a delivery is
 * what the business actually bought. One row per item and pack, so "2 × 25 kg
 * sack" and "4 × 1 kg pack" of the same rice stay readable instead of being
 * summed into a kilogram figure nobody ordered in. Goods refused at the door
 * sit beside what was kept, because "we bought 10 and sent 2 back" is one fact.
 */
export async function purchaseList(
    locationId: number,
    range: DateRange
): Promise<{ summary: PurchaseListSummary; rows: PurchaseListRow[] }> {
    const { rows } = await sql<PurchaseListRow>`
        with g as (
          select id, supplier_id
            from grn
           where location_id = ${locationId}
             and received_at::date between ${range.from}::date and ${range.to}::date
        ),
        kept as (
          select g.supplier_id, i.id as item_id, p.id as pack_id,
                 sum(gl.qty_packs) as packs, count(distinct g.id) as deliveries
            from g
            join grn_lines gl  on gl.grn_id = g.id
            join item_packs p  on p.id = gl.item_pack_id
            join items i       on i.id = p.item_id
           group by g.supplier_id, i.id, p.id
        ),
        refused as (
          select g.supplier_id, r.item_id, r.item_pack_id as pack_id,
                 sum(r.qty_packs) as packs, count(distinct g.id) as deliveries
            from g
            join grn_rejections r on r.grn_id = g.id
           where r.item_id is not null
           group by g.supplier_id, r.item_id, r.item_pack_id
        ),
        items_bought as (
          select coalesce(k.supplier_id, f.supplier_id) as supplier_id,
                 coalesce(k.item_id, f.item_id)         as item_id,
                 coalesce(k.pack_id, f.pack_id)         as pack_id,
                 coalesce(k.packs, 0)                   as packs,
                 coalesce(f.packs, 0)                   as sent_back,
                 greatest(coalesce(k.deliveries, 0), coalesce(f.deliveries, 0)) as deliveries
            from kept k
            full join refused f
              on f.supplier_id = k.supplier_id and f.item_id = k.item_id and f.pack_id = k.pack_id
        ),
        named as (
          select g.supplier_id, o.description as name, o.unit,
                 sum(o.qty) as qty, count(distinct g.id) as deliveries
            from g
            join grn_other_lines o on o.grn_id = g.id
           group by g.supplier_id, o.description, o.unit
        ),
        named_refused as (
          select g.supplier_id, r.description as name, r.unit, sum(r.qty_packs) as qty
            from g
            join grn_rejections r on r.grn_id = g.id
           where r.item_id is null
           group by g.supplier_id, r.description, r.unit
        )
        select s.id                                   as "supplierId",
               s.name                                 as "supplierName",
               i.id                                   as "itemId",
               i.code,
               i.name,
               i.stock_unit                           as unit,
               p.pack_name                            as "packName",
               round(b.packs, 3)                      as "qtyPacks",
               round(b.packs * p.qty_in_stock_unit, 3) as "qtyBase",
               round(b.sent_back, 3)                  as "qtyPacksSentBack",
               b.deliveries::int                      as deliveries
          from items_bought b
          join suppliers s  on s.id = b.supplier_id
          join items i      on i.id = b.item_id
          join item_packs p on p.id = b.pack_id
        union all
        select s.id, s.name, null, null,
               coalesce(n.name, nr.name),
               coalesce(n.unit, nr.unit),
               null,
               round(coalesce(n.qty, 0), 3),
               round(coalesce(n.qty, 0), 3),
               round(coalesce(nr.qty, 0), 3),
               coalesce(n.deliveries, 1)::int
          from named n
          full join named_refused nr
            on nr.supplier_id = n.supplier_id and nr.name = n.name
          join suppliers s on s.id = coalesce(n.supplier_id, nr.supplier_id)
        order by 2, 5
    `.execute(db);

    const { rows: head } = await sql<PurchaseListSummary>`
        select
          (select count(*) from grn
            where location_id = ${locationId}
              and received_at::date between ${range.from}::date and ${range.to}::date)::int
            as deliveries,
          (select count(distinct supplier_id) from grn
            where location_id = ${locationId}
              and received_at::date between ${range.from}::date and ${range.to}::date)::int
            as suppliers,
          0 as lines,
          (select count(distinct r.grn_id) from grn_rejections r join grn g on g.id = r.grn_id
            where g.location_id = ${locationId}
              and g.received_at::date between ${range.from}::date and ${range.to}::date)::int
            as "deliveriesWithReturns",
          (select count(*) from purchase_orders
            where location_id = ${locationId}
              and raised_at::date between ${range.from}::date and ${range.to}::date)::int
            as "ordersRaised"
    `.execute(db);

    const list = rows.map((r) => ({
        ...r,
        qtyPacks: Number(r.qtyPacks),
        qtyBase: Number(r.qtyBase),
        qtyPacksSentBack: Number(r.qtyPacksSentBack),
        deliveries: Number(r.deliveries),
    }));
    const summary = { ...head[0]!, lines: list.length };
    return { summary, rows: list };
}

// ── What each section asked for, and got ────────────────────────────────────

export interface SectionRequestRow {
    sectionId: number;
    sectionName: string;
    itemId: number;
    code: string;
    name: string;
    stockUnit: string;
    /** How many separate requests it was on. */
    requests: number;
    /** Asked for, on requests that were not cancelled. */
    qtyAsked: number;
    /** Handed over by the store. */
    qtySent: number;
    /** Of that, confirmed arrived by the section. */
    qtyConfirmed: number;
    /** On requests the store has not answered yet. */
    qtyWaiting: number;
    /** Asked, answered, and not given: the store sent less than asked. */
    qtyShort: number;
}

export interface SectionRequestSummary {
    sectionId: number;
    sectionName: string;
    requests: number;
    /** Requests the store has not answered yet. */
    waiting: number;
    /** Released but the section has not confirmed it arrived. */
    notConfirmed: number;
    cancelled: number;
    items: number;
    /** Items where the store sent less than was asked. */
    itemsShort: number;
}

/**
 * Per section and item: asked, sent, confirmed - for the period.
 *
 * A request belongs to the period it was raised in. "Sent" is what the store
 * released; "confirmed" is the part of that the section has said arrived, so
 * a gap between the two is stock somewhere between the store and the kitchen
 * door. "Short" counts only answered requests: a request still waiting is not
 * short, it is waiting, and is shown as such.
 */
export async function sectionRequests(
    locationId: number,
    range: DateRange
): Promise<{ sections: SectionRequestSummary[]; rows: SectionRequestRow[] }> {
    const { rows } = await sql<SectionRequestRow>`
        select sec.id                                         as "sectionId",
               sec.name                                       as "sectionName",
               it.id                                          as "itemId",
               it.code,
               it.name,
               it.stock_unit                                  as "stockUnit",
               count(distinct i.id)::int                      as requests,
               round(sum(l.qty_requested), 3)                 as "qtyAsked",
               round(sum(coalesce(l.qty_issued, 0))
                 filter (where i.status in ('released', 'received')), 3) as "qtySent",
               round(sum(coalesce(l.qty_issued, 0))
                 filter (where i.status = 'received'), 3)     as "qtyConfirmed",
               round(sum(l.qty_requested)
                 filter (where i.status = 'requested'), 3)    as "qtyWaiting",
               round(sum(greatest(0, l.qty_requested - coalesce(l.qty_issued, 0)))
                 filter (where i.status in ('released', 'received')), 3) as "qtyShort"
          from issues i
          join sections sec    on sec.id = i.to_section_id
          join issue_lines l   on l.issue_id = i.id
          join items it        on it.id = l.item_id
         where i.location_id = ${locationId}
           and i.status <> 'cancelled'
           and i.requested_at::date between ${range.from}::date and ${range.to}::date
         group by sec.id, sec.name, it.id, it.code, it.name, it.stock_unit
         order by sec.name, it.name
    `.execute(db);

    const { rows: heads } = await sql<SectionRequestSummary>`
        select sec.id                                                as "sectionId",
               sec.name                                              as "sectionName",
               count(*) filter (where i.status <> 'cancelled')::int  as requests,
               count(*) filter (where i.status = 'requested')::int   as waiting,
               count(*) filter (where i.status = 'released')::int    as "notConfirmed",
               count(*) filter (where i.status = 'cancelled')::int   as cancelled,
               0 as items,
               0 as "itemsShort"
          from issues i
          join sections sec on sec.id = i.to_section_id
         where i.location_id = ${locationId}
           and i.requested_at::date between ${range.from}::date and ${range.to}::date
         group by sec.id, sec.name
         order by sec.name
    `.execute(db);

    const list = rows.map((r) => ({
        ...r,
        requests: Number(r.requests),
        qtyAsked: Number(r.qtyAsked ?? 0),
        qtySent: Number(r.qtySent ?? 0),
        qtyConfirmed: Number(r.qtyConfirmed ?? 0),
        qtyWaiting: Number(r.qtyWaiting ?? 0),
        qtyShort: Number(r.qtyShort ?? 0),
    }));
    const sections = heads.map((h) => {
        const mine = list.filter((r) => r.sectionId === h.sectionId);
        return {
            ...h,
            items: mine.length,
            itemsShort: mine.filter((r) => r.qtyShort > 0).length,
        };
    });
    return { sections, rows: list };
}
