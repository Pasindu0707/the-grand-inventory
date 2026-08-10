/**
 * Grand inventory — demo data generator.
 *
 * Reads items.csv, emits seed.sql: master data plus 60 business days of
 * movements for the Gastrobar, with deliberately planted anomalies so the
 * variance reports have something real to detect.
 *
 *   node --experimental-strip-types seed/generate.ts > seed.sql
 *
 * Every row carries is_demo = true. To go live:
 *   delete from stock_ledger where is_demo;  -- see reset.sql
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DAYS = 60;

// deterministic PRNG so every run produces identical data
let seed = 20260810;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const between = (a: number, b: number) => a + rnd() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

const q = (s: unknown) =>
  s === null || s === undefined || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`;

type Item = {
  id: number; code: string; name: string; category: string; storage: string;
  stock_unit: string; pack_name: string; pack_qty: number; par: number;
  reorder: number; shelf: string; critical: boolean; cost: number;
};

// ---------------------------------------------------------------------------
// item master
// ---------------------------------------------------------------------------

const rows = readFileSync(join(HERE, "items.csv"), "utf8").trim().split("\n").slice(1);

// rough LKR cost per stock unit, by category — enough to make values realistic
const COST: Record<string, [number, number]> = {
  "Dry goods": [0.3, 3.5], Dairy: [0.6, 4], Meat: [1.4, 4.5], Seafood: [1.8, 6],
  Vegetables: [0.2, 1.2], Fruit: [0.4, 2.5], Beverages: [110, 190],
  "Bar spirits": [4, 12], "Bar beer": [380, 520], "Bar wine": [3, 8],
  Packaging: [4, 30], Cleaning: [0.6, 3], Gas: [4600, 4900],
};

const items: Item[] = rows.map((line, i) => {
  const c = line.split(",");
  const [lo, hi] = COST[c[2]] ?? [1, 3];
  return {
    id: i + 1, code: c[0], name: c[1], category: c[2], storage: c[3],
    stock_unit: c[4], pack_name: c[5], pack_qty: +c[6], par: +c[7],
    reorder: +c[8], shelf: c[9], critical: c[10] === "TRUE",
    cost: +between(lo, hi).toFixed(3),
  };
});

const byCode = new Map(items.map((i) => [i.code, i]));
const catItems = (cat: string) => items.filter((i) => i.category === cat);

// ---------------------------------------------------------------------------
// static master data
// ---------------------------------------------------------------------------

const SECTIONS = [
  { id: 1, code: "STORE", name: "Main store", store: true },
  { id: 2, code: "KITCHEN", name: "Kitchen", store: false },
  { id: 3, code: "BAKERY", name: "Bakery and pastry", store: false },
  { id: 4, code: "BAR", name: "Bar", store: false },
  { id: 5, code: "CLEAN", name: "Cleaning", store: false },
];

const USERS = [
  { id: 1, name: "Owner", role: "owner", loc: "null" },
  { id: 2, name: "Nuwan Perera", role: "manager", loc: "1" },
  { id: 3, name: "Sunil Fernando", role: "storekeeper", loc: "1" },
  { id: 4, name: "Chaminda Silva", role: "chef", loc: "1" },
  { id: 5, name: "Ruwan Dias", role: "baker", loc: "1" },
  { id: 6, name: "Tharindu Jay", role: "bar", loc: "1" },
  { id: 7, name: "Malani Kumari", role: "cleaning", loc: "1" },
];

const SUPPLIERS = [
  { id: 1, name: "Ceylon Provisions (Pvt) Ltd", cash: false },
  { id: 2, name: "Negombo Fish Market", cash: true },
  { id: 3, name: "Kochchikade Vegetable Pola", cash: true },
  { id: 4, name: "Lanka Dairy Distributors", cash: false },
  { id: 5, name: "Prime Meats Negombo", cash: false },
  { id: 6, name: "Island Beverages Agency", cash: false },
  { id: 7, name: "Colombo Bar Supplies", cash: false },
  { id: 8, name: "CleanPro Chemicals", cash: false },
];

// products the bakery/kitchen declare each day — the Phase 2 depletion driver
const PRODUCTS = [
  { id: 1, code: "CAKE-CHOC", name: "Chocolate fudge cake", sec: 3, yield: 1,
    recipe: [["DRY-004", 450], ["DRY-005", 400], ["DAI-003", 250], ["DAI-008", 4],
             ["DRY-013", 90], ["DRY-014", 200], ["DAI-002", 200]] },
  { id: 2, code: "CAKE-BLUE", name: "Blueberry cake", sec: 3, yield: 1,
    recipe: [["DRY-004", 420], ["DRY-005", 350], ["DAI-003", 220], ["DAI-008", 4],
             ["FRU-005", 250], ["DAI-002", 150]] },
  { id: 3, code: "BUN-FISH", name: "Fish bun", sec: 3, yield: 20,
    recipe: [["DRY-004", 1200], ["DRY-015", 20], ["SEA-004", 600], ["VEG-001", 300],
             ["DRY-021", 80], ["DRY-018", 20]] },
  { id: 4, code: "PUFF-CHIC", name: "Chicken puff", sec: 3, yield: 20,
    recipe: [["DRY-003", 1000], ["DAI-003", 400], ["MEA-002", 700], ["VEG-001", 250],
             ["DRY-017", 25]] },
  { id: 5, code: "SAND-CLUB", name: "Club sandwich", sec: 2, yield: 1,
    recipe: [["DRY-004", 120], ["MEA-001", 120], ["MEA-007", 40], ["DAI-004", 30],
             ["VEG-009", 40], ["VEG-005", 50], ["DAI-008", 1]] },
  { id: 6, code: "PASTA-VEG", name: "Vegetable pasta", sec: 2, yield: 1,
    recipe: [["DRY-009", 120], ["DAI-002", 80], ["VEG-005", 100], ["VEG-007", 60],
             ["DAI-004", 40], ["DRY-023", 20]] },
  { id: 7, code: "RICE-SEAF", name: "Seafood fried rice", sec: 2, yield: 1,
    recipe: [["DRY-001", 200], ["SEA-001", 90], ["SEA-002", 60], ["DAI-008", 1],
             ["VEG-006", 50], ["DRY-021", 30]] },
  { id: 8, code: "CURRY-CHIC", name: "Chicken curry", sec: 2, yield: 1,
    recipe: [["MEA-003", 250], ["VEG-001", 80], ["DRY-017", 15], ["DRY-021", 25],
             ["VEG-012", 5]] },
];

// ---------------------------------------------------------------------------
// emit master data
// ---------------------------------------------------------------------------

const out: string[] = [];
const w = (s: string) => out.push(s);

w("begin;");
w(`insert into locations (id,code,name,day_start,is_active,is_demo) values
  (1,'GB','The Grand Gastrobar','06:00',true,true),
  (2,'ESP','Grand Espresso Bar','06:00',false,true),
  (3,'TCL','The Grand Coffee Lounge','04:00',false,true),
  (4,'KAT','The Grand Cafe Katuneriya','06:00',false,true),
  (5,'BANQ','Banquet hall','06:00',false,true);`);

w("insert into sections (id,location_id,code,name,is_store,is_demo) values");
w(SECTIONS.map((s) => `  (${s.id},1,${q(s.code)},${q(s.name)},${s.store},true)`).join(",\n") + ";");

w("insert into users (id,location_id,name,role,pin_hash,is_demo) values");
w(USERS.map((u) => `  (${u.id},${u.loc},${q(u.name)},'${u.role}','$demo$',true)`).join(",\n") + ";");

w("insert into suppliers (id,name,is_cash_market,is_demo) values");
w(SUPPLIERS.map((s) => `  (${s.id},${q(s.name)},${s.cash},true)`).join(",\n") + ";");

const cats = [...new Set(items.map((i) => i.category))];
w("insert into item_categories (id,name,storage) values");
w(cats.map((c, i) =>
  `  (${i + 1},${q(c)},'${items.find((x) => x.category === c)!.storage}')`).join(",\n") + ";");

w("insert into items (id,code,name,category_id,stock_unit,par_level,reorder_point,shelf_life_days,is_critical,is_demo) values");
w(items.map((i) =>
  `  (${i.id},${q(i.code)},${q(i.name)},${cats.indexOf(i.category) + 1},${q(i.stock_unit)},` +
  `${i.par},${i.reorder},${i.shelf || "null"},${i.critical},true)`).join(",\n") + ";");

w("insert into item_packs (id,item_id,pack_name,qty_in_stock_unit,is_default_purchase,is_demo) values");
w(items.map((i) =>
  `  (${i.id},${i.id},${q(i.pack_name)},${i.pack_qty},true,true)`).join(",\n") + ";");

w("insert into products (id,location_id,code,name,section_id,yield_qty,is_demo) values");
w(PRODUCTS.map((p) =>
  `  (${p.id},1,${q(p.code)},${q(p.name)},${p.sec},${p.yield},true)`).join(",\n") + ";");

let rlId = 0;
w("insert into recipe_lines (id,product_id,item_id,qty_base,is_demo) values");
w(PRODUCTS.flatMap((p) => p.recipe.map(([code, qty]) =>
  `  (${++rlId},${p.id},${byCode.get(code as string)!.id},${qty},true)`)).join(",\n") + ";");

// ---------------------------------------------------------------------------
// movement generation
// ---------------------------------------------------------------------------

type Led = { date: string; sec: number; item: number; qty: number; cost: number;
             doc: string; docId: number; reason: string | null; by: number };
const ledger: Led[] = [];
const stock = new Map<string, number>();          // `${sec}:${item}` -> ledger qty
const phantom = new Map<string, number>();        // unexplained physical loss
const key = (s: number, i: number) => `${s}:${i}`;
const get = (s: number, i: number) => stock.get(key(s, i)) ?? 0;

const move = (d: string, sec: number, it: Item, qty: number, doc: string,
              docId: number, by: number, reason: string | null = null) => {
  stock.set(key(sec, it.id), get(sec, it.id) + qty);
  ledger.push({ date: d, sec, item: it.id, qty, cost: it.cost, doc, docId, reason, by });
};

const dates: string[] = [];
const start = new Date("2026-06-10T00:00:00Z");
for (let d = 0; d < DAYS; d++)
  dates.push(new Date(start.getTime() + d * 864e5).toISOString().slice(0, 10));

// opening balance: store starts at par; the bar also holds working stock,
// otherwise it has nothing to count and shrinkage would be invisible.
for (const it of items) move(dates[0], 1, it, it.par, "opening", 0, 3);
for (const it of items.filter((i) => i.category.startsWith("Bar")))
  move(dates[0], 4, it, Math.round(it.par * 0.4), "opening", 0, 6);

const grn: string[] = [], grnL: string[] = [], mkt: string[] = [], mktL: string[] = [];
const iss: string[] = [], issL: string[] = [], wst: string[] = [];
const cnt: string[] = [], cntL: string[] = [], prod: string[] = [];
let grnId = 0, mktId = 0, issId = 0, wstId = 0, cntId = 0, prodId = 0, lineId = 0;

// ---- planted anomalies -----------------------------------------------------
// A. chicken breast over-issued by ~18% from day 20  -> negative count variance
// B. two gin bottles vanish (day 28, day 44)         -> shrinkage, no wastage doc
// C. sunflower oil price +32% on day 35              -> price-increase alert
// D. lettuce spoilage spike in week 6                -> genuine waste, not theft
// E. prawns hit zero on day 41                       -> stock-out alert
// ---------------------------------------------------------------------------

for (let d = 0; d < DAYS; d++) {
  const date = dates[d];
  const dow = new Date(date).getUTCDay();
  const busy = dow === 0 || dow === 5 || dow === 6 ? 1.45 : 1;

  // --- C: price change
  if (d === 35) byCode.get("DRY-022")!.cost *= 1.32;

  // --- deliveries: restock anything below reorder point
  const low = items.filter((i) => get(1, i.id) < i.reorder);
  const bySupplier = new Map<number, Item[]>();
  for (const it of low) {
    const s = it.category === "Dairy" ? 4 : it.category === "Meat" ? 5
      : it.category === "Seafood" ? 2 : it.category === "Vegetables" ? 3
      : it.category === "Fruit" ? 3 : it.category === "Beverages" ? 6
      : it.category.startsWith("Bar") ? 7 : it.category === "Cleaning" ? 8 : 1;
    (bySupplier.get(s) ?? bySupplier.set(s, []).get(s)!).push(it);
  }
  for (const [sup, list] of bySupplier) {
    const cash = SUPPLIERS.find((s) => s.id === sup)!.cash;
    if (cash) {
      mktId++;
      mkt.push(`  (${mktId},1,${sup},'${date} 05:30+05:30',3,true)`);
      for (const it of list) {
        const packs = Math.ceil((it.par - get(1, it.id)) / it.pack_qty);
        const qty = packs * it.pack_qty;
        mktL.push(`  (${++lineId},${mktId},${it.id},${qty},${(qty * it.cost).toFixed(2)},true)`);
        move(date, 1, it, qty, "market", mktId, 3);
      }
    } else {
      grnId++;
      grn.push(`  (${grnId},1,${sup},'INV-${1000 + grnId}','${date}','${date} 08:00+05:30',3,true)`);
      for (const it of list) {
        const packs = Math.ceil((it.par - get(1, it.id)) / it.pack_qty);
        grnL.push(`  (${++lineId},${grnId},${it.id},${packs},${(it.pack_qty * it.cost).toFixed(2)},true)`);
        move(date, 1, it, packs * it.pack_qty, "grn", grnId, 3);
      }
    }
  }

  // --- production declared by bakery and kitchen
  const madeToday = new Map<number, number>();
  for (const p of PRODUCTS) {
    const base = p.sec === 3 ? between(6, 14) : between(18, 40);
    const made = Math.round(base * busy);
    madeToday.set(p.id, made);
    prod.push(`  (${++prodId},1,${p.sec},'${date}',${p.id},${made},${p.sec === 3 ? 5 : 4},true)`);
  }

  // --- issues from store to sections, driven by production + a fudge factor
  const need = new Map<number, { it: Item; qty: number; sec: number }>();
  for (const p of PRODUCTS) {
    const made = madeToday.get(p.id)!;
    for (const [code, qty] of p.recipe) {
      const it = byCode.get(code as string)!;
      let q2 = ((qty as number) * made) / p.yield;
      q2 *= between(1.02, 1.09);                               // normal trim loss
      if (code === "MEA-001" && d >= 20) q2 *= 1.18;           // A: over-issue
      const k = p.sec * 1e6 + it.id;
      const cur = need.get(k);
      if (cur) cur.qty += q2; else need.set(k, { it, qty: q2, sec: p.sec });
    }
  }
  const grouped = new Map<number, { it: Item; qty: number }[]>();
  for (const n of need.values())
    (grouped.get(n.sec) ?? grouped.set(n.sec, []).get(n.sec)!).push({ it: n.it, qty: n.qty });

  for (const [sec, lines] of grouped) {
    issId++;
    iss.push(`  (${issId},1,${sec},${sec === 3 ? 5 : 4},3,'${date} 06:30+05:30','${date} 06:45+05:30','issued',true)`);
    for (const l of lines) {
      const qty = Math.min(Math.round(l.qty), get(1, l.it.id));
      if (qty <= 0) continue;
      issL.push(`  (${++lineId},${issId},${l.it.id},${qty},${qty},true)`);
      move(date, 1, l.it, -qty, "issue", issId, 3);
      move(date, sec, l.it, qty, "issue", issId, 3);
      move(date, sec, l.it, -Math.round(qty * between(0.9, 0.99)), "production", prodId, sec === 3 ? 5 : 4);
    }
  }

  // --- bar consumption
  for (const it of catItems("Bar spirits").concat(catItems("Bar beer"), catItems("Bar wine"))) {
    const used = Math.round(between(0.04, 0.11) * it.par * busy);
    if (get(1, it.id) >= used) {
      issId++;
      iss.push(`  (${issId},1,4,6,3,'${date} 16:00+05:30','${date} 16:10+05:30','issued',true)`);
      issL.push(`  (${++lineId},${issId},${it.id},${used},${used},true)`);
      move(date, 1, it, -used, "issue", issId, 3);
      move(date, 4, it, used, "issue", issId, 6);
      move(date, 4, it, -used, "production", 0, 6);
    }
  }
  // B: gin shrinkage — physical stock leaves the bar with no document at all.
  // The ledger still believes it is there; only the count reveals the gap.
  if (d === 28 || d === 44) {
    const gin = byCode.get("BAR-001")!;
    phantom.set(key(4, gin.id), (phantom.get(key(4, gin.id)) ?? 0) + 750);
  }

  // --- cleaning consumption (weekly top-up)
  if (dow === 1) {
    issId++;
    iss.push(`  (${issId},1,5,7,3,'${date} 09:00+05:30','${date} 09:15+05:30','issued',true)`);
    for (const it of catItems("Cleaning")) {
      const used = Math.round(between(0.12, 0.3) * it.par);
      if (get(1, it.id) < used) continue;
      issL.push(`  (${++lineId},${issId},${it.id},${used},${used},true)`);
      move(date, 1, it, -used, "issue", issId, 3);
      move(date, 5, it, used, "issue", issId, 7);
      move(date, 5, it, -used, "production", 0, 7);
    }
  }

  // --- wastage
  const wasteCandidates = catItems("Vegetables").concat(catItems("Fruit"), catItems("Dairy"));
  const nWaste = rnd() < 0.6 ? 1 : rnd() < 0.85 ? 2 : 0;
  for (let n = 0; n < nWaste; n++) {
    const it = pick(wasteCandidates);
    const qty = Math.round(between(0.01, 0.05) * it.par);
    if (get(2, it.id) < qty || qty <= 0) continue;
    wst.push(`  (${++wstId},1,2,${it.id},${qty},'SPOIL',4,'${date} 21:00+05:30',2,true)`);
    move(date, 2, it, -qty, "wastage", wstId, 4, "SPOIL");
  }
  // D: lettuce spoilage spike, week 6
  if (d >= 38 && d <= 44) {
    const let_ = byCode.get("VEG-009")!;
    const qty = Math.round(between(0.15, 0.28) * let_.par);
    if (get(2, let_.id) >= qty) {
      wst.push(`  (${++wstId},1,2,${let_.id},${qty},'SPOIL',4,'${date} 21:00+05:30',2,true)`);
      move(date, 2, let_, -qty, "wastage", wstId, 4, "SPOIL");
    }
  }
  // E: prawns run out on day 41
  if (d === 41) {
    const pr = byCode.get("SEA-001")!;
    const left = get(1, pr.id);
    if (left > 0) {
      issId++;
      iss.push(`  (${issId},1,2,4,3,'${date} 18:00+05:30','${date} 18:05+05:30','issued',true)`);
      issL.push(`  (${++lineId},${issId},${pr.id},${left},${left},true)`);
      move(date, 1, pr, -left, "issue", issId, 3);
      move(date, 2, pr, left, "issue", issId, 4);
      move(date, 2, pr, -left, "production", 0, 4);
    }
  }

  // --- counts: critical items daily, full store weekly (Sunday)
  const daily = items.filter((i) => i.critical);
  cntId++;
  cnt.push(`  (${cntId},1,1,'daily_critical','${date}',3,2,'${date} 22:00+05:30',true)`);
  for (const it of daily) {
    const expected = get(1, it.id);
    // small honest counting noise; shrinkage shows up as a real gap
    const counted = Math.max(0, Math.round(expected * between(0.995, 1.002)));
    const diff = counted - expected;
    cntL.push(`  (${++lineId},${cntId},${it.id},${expected.toFixed(3)},${counted},${(diff * it.cost).toFixed(2)},true)`);
    if (diff !== 0) move(date, 1, it, diff, "count", cntId, 3, "COUNTADJ");
  }
  if (dow === 0) {
    cntId++;
    cnt.push(`  (${cntId},1,4,'weekly_full','${date}',6,2,'${date} 23:30+05:30',true)`);
    for (const it of catItems("Bar spirits").concat(catItems("Bar beer"), catItems("Bar wine"))) {
      const expected = get(4, it.id);
      const lost = phantom.get(key(4, it.id)) ?? 0;
      phantom.delete(key(4, it.id));
      const counted = Math.max(0, Math.round(expected - lost));
      const diff = counted - expected;
      cntL.push(`  (${++lineId},${cntId},${it.id},${expected.toFixed(3)},${counted},${(diff * it.cost).toFixed(2)},true)`);
      if (diff !== 0) move(date, 4, it, diff, "count", cntId, 6, "COUNTADJ");
    }
  }
}

// ---------------------------------------------------------------------------
// emit documents + ledger
// ---------------------------------------------------------------------------

const block = (sql: string, rows2: string[]) => { if (rows2.length) { w(sql); w(rows2.join(",\n") + ";"); } };

w(`insert into reason_codes (code,doc,label) values
  ('SPOIL','wastage','Spoiled / expired'),
  ('BURNT','wastage','Burnt or overcooked'),
  ('DROP','wastage','Dropped or damaged'),
  ('BREAK','wastage','Breakage'),
  ('RETURN','wastage','Customer returned'),
  ('COUNTADJ','count','Count adjustment');`);

block("insert into grn (id,location_id,supplier_id,invoice_no,invoice_date,received_at,received_by,is_demo) values", grn);
block("insert into grn_lines (id,grn_id,item_pack_id,qty_packs,pack_price,is_demo) values", grnL);
block("insert into market_purchase (id,location_id,supplier_id,bought_at,bought_by,is_demo) values", mkt);
block("insert into market_purchase_lines (id,market_id,item_id,qty_base,total_price,is_demo) values", mktL);
block("insert into issues (id,location_id,to_section_id,requested_by,issued_by,requested_at,issued_at,status,is_demo) values", iss);
block("insert into issue_lines (id,issue_id,item_id,qty_requested,qty_issued,is_demo) values", issL);
block("insert into wastage (id,location_id,section_id,item_id,qty_base,reason_code,logged_by,logged_at,approved_by,is_demo) values", wst);
block("insert into stock_counts (id,location_id,section_id,count_type,business_date,counted_by,verified_by,closed_at,is_demo) values", cnt);
block("insert into stock_count_lines (id,count_id,item_id,qty_expected,qty_counted,variance_value,is_demo) values", cntL);
block("insert into production_log (id,location_id,section_id,business_date,product_id,qty_made,logged_by,is_demo) values", prod);

w("insert into stock_ledger (business_date,location_id,section_id,item_id,qty_base,unit_cost,doc,doc_id,reason_code,created_by,is_demo) values");
w(ledger.map((l) =>
  `  ('${l.date}',1,${l.sec},${l.item},${l.qty.toFixed(3)},${l.cost},'${l.doc}',${l.docId},${l.reason ? q(l.reason) : "null"},${l.by},true)`
).join(",\n") + ";");

w("select setval('stock_ledger_id_seq',(select max(id) from stock_ledger));");
w("commit;");

process.stdout.write(out.join("\n") + "\n");
process.stderr.write(
  `-- generated: ${items.length} items, ${ledger.length} ledger rows, ` +
  `${grnId} GRNs, ${mktId} market buys, ${issId} issues, ${wstId} wastage, ${cntId} counts\n`
);
