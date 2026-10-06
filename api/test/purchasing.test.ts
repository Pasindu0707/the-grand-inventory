/**
 * The purchasing cycle, end to end: raise, approve, order, part-deliver,
 * finish. Plus the opening balance a section gets before any of that.
 *
 * The case worth testing is the short delivery. An order that closes itself
 * the moment anything arrives looks fine in every demo and loses four sacks in
 * production, because the thing it stops showing you is the thing you needed
 * to chase.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { db, makeApp } from './helpers.js';
import type { UserRole } from '../src/db/types.js';

let app: FastifyInstance;
const H: Record<string, Record<string, string>> = {};

const idem = () => ({ 'idempotency-key': randomUUID() });
const tag = () => randomUUID().slice(0, 8).toUpperCase();

async function signIn(role: UserRole, locationId?: number) {
    const user = await db
        .selectFrom('users')
        .select(['id', 'location_id'])
        .where('role', '=', role)
        .where('is_active', '=', true)
        .orderBy('id')
        .executeTakeFirstOrThrow();

    const at = locationId ?? user.location_id ?? 1;
    const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { userId: user.id, locationId: at, pin: '1234' }
    });

    return {
        authorization: `Bearer ${res.json().accessToken}`,
        'x-location-id': String(at)
    };
}

/** An item with a default purchase pack, which is what an order is placed in. */
async function orderable() {
    const row = await db
        .selectFrom('items')
        .innerJoin('item_packs as p', (join) =>
            join.onRef('p.item_id', '=', 'items.id').on('p.is_default_purchase', '=', true)
        )
        .select([
            'items.id as itemId',
            'items.name',
            'p.id as packId',
            'p.qty_in_stock_unit as packSize'
        ])
        .where('items.is_active', '=', true)
        .orderBy('items.id')
        .executeTakeFirstOrThrow();
    return { ...row, packSize: Number(row.packSize) };
}

/** Somebody to order from. Every order is placed with a supplier now. */
async function aSupplier() {
    return db
        .selectFrom('suppliers')
        .select('id')
        .where('is_active', '=', true)
        .orderBy('id')
        .executeTakeFirstOrThrow();
}

async function poById(id: string, headers: Record<string, string>) {
    const list = (
        await app.inject({ method: 'GET', url: '/api/v1/purchase-orders?limit=200', headers })
    ).json();
    return list.items.find((p: { id: string }) => p.id === id);
}

beforeAll(async () => {
    app = await makeApp();
    for (const role of ['admin', 'management', 'storekeeper', 'kitchen'] as const) {
        H[role] = await signIn(role);
    }
});

afterAll(async () => {
    await app.close();
    await db.destroy();
});

describe('raising a purchase order', () => {
    it('lets the storekeeper order before anyone has gone short', async () => {
        const item = await orderable();
        const supplier = await aSupplier();

        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['storekeeper']!,
            payload: {
                supplierId: supplier.id,
                reason: 'running low on the shelf',
                neededBy: '2026-09-01',
                lines: [{ itemPackId: item.packId, qtyPacks: 4 }]
            }
        });
        expect(raised.statusCode).toBe(201);

        const po = await poById(raised.json().id, H['management']!);
        expect(po.status).toBe('requested');
        // Ordered in packs, held in stock units: the conversion happens once.
        expect(po.lines[0].qtyPacks).toBe(4);
        expect(po.lines[0].qtyBase).toBe(4 * item.packSize);
    });

    it('refuses an order that is not placed with anybody', async () => {
        const item = await orderable();
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['storekeeper']!,
            payload: { lines: [{ itemPackId: item.packId, qtyPacks: 1 }] }
        });

        expect(res.statusCode).toBe(400);
    });

    it("needs no approval when management raises it - they would be the ones giving it", async () => {
        const item = await orderable();
        const supplier = await aSupplier();

        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['management']!,
            payload: { supplierId: supplier.id, lines: [{ itemPackId: item.packId, qtyPacks: 2 }] }
        });
        expect(raised.statusCode).toBe(201);
        expect(raised.json().status).toBe('approved');

        const po = await poById(raised.json().id, H['management']!);
        expect(po.status).toBe('approved');
        expect(po.decidedBy).not.toBeNull();
    });
});

describe('a short delivery', () => {
    it('keeps the order open on the balance, then closes it when the rest arrives', async () => {
        const item = await orderable();
        const supplier = await db
            .selectFrom('suppliers')
            .select('id')
            .where('is_active', '=', true)
            .executeTakeFirstOrThrow();

        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['storekeeper']!,
            payload: { supplierId: supplier.id, lines: [{ itemPackId: item.packId, qtyPacks: 10 }] }
        });
        const poId = raised.json().id;

        // Nothing can be received against it until management has said yes.
        const tooEarly = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                poId,
                lines: [{ itemPackId: item.packId, qtyPacks: 1 }]
            }
        });
        expect(tooEarly.statusCode).toBe(409);
        expect(tooEarly.json().message).toContain('not approved');

        await app.inject({
            method: 'POST',
            url: `/api/v1/purchase-orders/${poId}/decide`,
            headers: H['management']!,
            payload: { decision: 'ordered', supplierId: supplier.id, note: 'call them Monday' }
        });

        // Six of the ten turn up.
        const part = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                poId,
                invoiceNo: `INV-${tag()}`,
                lines: [{ itemPackId: item.packId, qtyPacks: 6 }]
            }
        });
        expect(part.statusCode).toBe(201);

        const open = await poById(poId, H['management']!);
        expect(open.status).toBe('ordered');
        expect(open.partReceived).toBe(true);
        expect(open.lines[0].qtyReceivedBase).toBe(6 * item.packSize);
        expect(open.lines[0].qtyOutstandingBase).toBe(4 * item.packSize);
        expect(open.closedAt).toBeNull();

        // And the stock actually arrived, order or no order.
        const inStore = await db
            .selectFrom('stock_ledger')
            .select('id')
            .where('doc', '=', 'grn')
            .where('doc_id', '=', String(part.json().id))
            .execute();
        expect(inStore.length).toBe(1);

        const rest = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                poId,
                lines: [{ itemPackId: item.packId, qtyPacks: 4 }]
            }
        });
        expect(rest.statusCode).toBe(201);

        const done = await poById(poId, H['management']!);
        expect(done.status).toBe('done');
        expect(done.partReceived).toBe(false);
        expect(done.lines[0].qtyOutstandingBase).toBe(0);
        expect(done.closedAt).not.toBeNull();
    });

    it('refuses a delivery from a supplier the order was not placed with', async () => {
        const item = await orderable();
        const [a, b] = await db
            .selectFrom('suppliers')
            .select('id')
            .where('is_active', '=', true)
            .orderBy('id')
            .limit(2)
            .execute();

        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['storekeeper']!,
            payload: { supplierId: a!.id, lines: [{ itemPackId: item.packId, qtyPacks: 2 }] }
        });
        const poId = raised.json().id;

        await app.inject({
            method: 'POST',
            url: `/api/v1/purchase-orders/${poId}/decide`,
            headers: H['management']!,
            payload: { decision: 'ordered', supplierId: a!.id }
        });

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: b!.id,
                poId,
                lines: [{ itemPackId: item.packId, qtyPacks: 2 }]
            }
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().message).toContain('different supplier');
    });

    it('can be closed short, with a reason, by management only', async () => {
        const item = await orderable();
        const supplier = await aSupplier();
        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['storekeeper']!,
            payload: { supplierId: supplier.id, lines: [{ itemPackId: item.packId, qtyPacks: 3 }] }
        });
        const poId = raised.json().id;

        const storeTry = await app.inject({
            method: 'POST',
            url: `/api/v1/purchase-orders/${poId}/close`,
            headers: H['storekeeper']!,
            payload: { note: 'never mind' }
        });
        expect(storeTry.statusCode).toBe(403);

        const closed = await app.inject({
            method: 'POST',
            url: `/api/v1/purchase-orders/${poId}/close`,
            headers: H['management']!,
            payload: { note: 'supplier had no more stock' }
        });
        expect(closed.statusCode).toBe(200);

        const po = await poById(poId, H['management']!);
        expect(po.status).toBe('done');
        expect(po.decisionNote).toBe('supplier had no more stock');
    });

    it('fills both lines when the same item is ordered in two pack sizes', async () => {
        // A real order: two 1 kg packs for the shelf and a sack for the store.
        // Matching a delivery by item alone used to dump everything on the
        // first line, leaving the second outstanding forever and the order
        // permanently open.
        // The seed gives every item one pack, so the second size is made here
        // rather than hunted for: depending on another test file having left
        // a two-pack item behind makes this pass or fail on run order.
        const base = await orderable();
        const added = await app.inject({
            method: 'POST',
            url: `/api/v1/setup/items/${base.itemId}/packs`,
            headers: H['admin']!,
            payload: {
                packName: `Bulk sack ${tag()}`,
                qtyInStockUnit: base.packSize * 10,
                isDefaultPurchase: false
            }
        });
        expect(added.statusCode).toBe(201);

        const small = { id: base.packId, size: base.packSize };
        const large = { id: added.json().id, size: base.packSize * 10 };
        const supplier = await db
            .selectFrom('suppliers')
            .select('id')
            .where('is_active', '=', true)
            .executeTakeFirstOrThrow();

        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['storekeeper']!,
            payload: {
                supplierId: supplier.id,
                lines: [
                    { itemPackId: small!.id, qtyPacks: 2 },
                    { itemPackId: large!.id, qtyPacks: 1 }
                ]
            }
        });
        expect(raised.statusCode).toBe(201);
        const poId = raised.json().id;

        await app.inject({
            method: 'POST',
            url: `/api/v1/purchase-orders/${poId}/decide`,
            headers: H['management']!,
            payload: { decision: 'ordered', supplierId: supplier.id }
        });

        // Everything arrives, in the packs it was ordered in.
        const delivered = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                poId,
                lines: [
                    { itemPackId: small!.id, qtyPacks: 2 },
                    { itemPackId: large!.id, qtyPacks: 1 }
                ]
            }
        });
        expect(delivered.statusCode).toBe(201);

        const po = await poById(poId, H['management']!);
        for (const line of po.lines) {
            expect(line.qtyOutstandingBase).toBe(0);
        }
        expect(po.status).toBe('done');
    });
});

describe('what a supplier delivers', () => {
    it('remembers anything added by hand, and ticks off a product that is not stock', async () => {
        const item = await orderable();
        // A supplier of its own, so the list starts from nothing.
        const made = await app.inject({
            method: 'POST',
            url: '/api/v1/setup/suppliers',
            headers: H['admin']!,
            payload: { name: `Test Supplier ${tag()}` }
        });
        const supplierId = made.json().id;

        const before = await app.inject({
            method: 'GET',
            url: `/api/v1/suppliers/${supplierId}/items`,
            headers: H['storekeeper']!
        });
        expect(before.json()).toEqual([]);

        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['management']!,
            payload: {
                supplierId,
                lines: [
                    { itemPackId: item.packId, qtyPacks: 3 },
                    { name: 'Gas regulator', unit: 'each', qty: 2 }
                ]
            }
        });
        expect(raised.statusCode).toBe(201);
        const poId = raised.json().id;

        // Both are on the supplier's list now, for next week's order.
        const after = (
            await app.inject({
                method: 'GET',
                url: `/api/v1/suppliers/${supplierId}/items`,
                headers: H['storekeeper']!
            })
        ).json();
        expect(after.map((r: { itemId: number | null }) => r.itemId)).toContain(item.itemId);
        expect(after).toContainEqual(
            expect.objectContaining({ itemId: null, name: 'Gas regulator', unit: 'each' })
        );

        const po = await poById(poId, H['management']!);
        const named = po.lines.find((l: { itemId: number | null }) => l.itemId === null);
        expect(named).toMatchObject({ name: 'Gas regulator', isStockItem: false, qtyPacks: 2 });
        expect(named.qtyOutstandingBase).toBe(2);

        // The stock item arrives. The order waits for the regulator too.
        const delivered = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId,
                poId,
                lines: [{ itemPackId: item.packId, qtyPacks: 3, expiryDate: '2027-01-31' }]
            }
        });
        expect(delivered.statusCode).toBe(201);
        expect((await poById(poId, H['management']!)).status).toBe('ordered');

        // Then the regulator, ticked off by its order line. Nothing reaches
        // the ledger for it.
        const regulator = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: { supplierId, poId, lines: [], otherLines: [{ poLineId: named.id, qty: 2 }] }
        });
        expect(regulator.statusCode).toBe(201);
        const ledger = await db
            .selectFrom('stock_ledger')
            .select('id')
            .where('doc', '=', 'grn')
            .where('doc_id', '=', String(regulator.json().id))
            .execute();
        expect(ledger).toHaveLength(0);
        expect((await poById(poId, H['management']!)).status).toBe('done');

        // Both deliveries read back with what the printed note needs.
        const first = (
            await app.inject({
                method: 'GET',
                url: `/api/v1/grn/${delivered.json().id}`,
                headers: H['storekeeper']!
            })
        ).json();
        expect(first.lines[0].expiryDate).toBe('2027-01-31');
        expect(first.order.id).toBe(poId);

        const second = (
            await app.inject({
                method: 'GET',
                url: `/api/v1/grn/${regulator.json().id}`,
                headers: H['storekeeper']!
            })
        ).json();
        expect(second.lines).toHaveLength(0);
        expect(second.otherLines).toEqual([
            expect.objectContaining({ name: 'Gas regulator', unit: 'each', qty: 2 })
        ]);
    });

    it('lets management void the one item that is not coming, and then the order closes', async () => {
        const item = await orderable();
        const supplier = await aSupplier();
        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['management']!,
            payload: {
                supplierId: supplier.id,
                lines: [
                    { itemPackId: item.packId, qtyPacks: 2 },
                    { name: `Mixer blade ${tag()}`, qty: 1 }
                ]
            }
        });
        const poId = raised.json().id;

        await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                poId,
                lines: [{ itemPackId: item.packId, qtyPacks: 2 }]
            }
        });

        const open = await poById(poId, H['management']!);
        expect(open.status).toBe('ordered');
        const blade = open.lines.find((l: { itemId: number | null }) => l.itemId === null);
        expect(blade.qtyOutstandingBase).toBe(1);

        const url = `/api/v1/purchase-orders/${poId}/lines/${blade.id}/void`;
        const storeTry = await app.inject({
            method: 'POST',
            url,
            headers: H['storekeeper']!,
            payload: { reason: 'supplier has none' }
        });
        expect(storeTry.statusCode).toBe(403);

        const noReason = await app.inject({
            method: 'POST',
            url,
            headers: H['management']!,
            payload: { reason: '' }
        });
        expect(noReason.statusCode).toBe(400);

        const voided = await app.inject({
            method: 'POST',
            url,
            headers: H['management']!,
            payload: { reason: 'supplier has none' }
        });
        expect(voided.statusCode).toBe(200);
        expect(voided.json().orderComplete).toBe(true);

        const done = await poById(poId, H['management']!);
        expect(done.status).toBe('done');
        const line = done.lines.find((l: { id: string }) => l.id === blade.id);
        expect(line).toMatchObject({ voided: true, voidReason: 'supplier has none', qtyOutstandingBase: 0 });

        const again = await app.inject({
            method: 'POST',
            url,
            headers: H['management']!,
            payload: { reason: 'supplier has none' }
        });
        expect(again.statusCode).toBe(409);
    });

    it('is kept by the admin as a whole list', async () => {
        const item = await orderable();
        const made = await app.inject({
            method: 'POST',
            url: '/api/v1/setup/suppliers',
            headers: H['admin']!,
            payload: { name: `Test Supplier ${tag()}` }
        });
        const supplierId = made.json().id;
        const url = `/api/v1/setup/suppliers/${supplierId}/items`;

        const notAdmin = await app.inject({
            method: 'PUT',
            url,
            headers: H['management']!,
            payload: { items: [{ itemId: item.itemId }] }
        });
        expect(notAdmin.statusCode).toBe(403);

        const saved = await app.inject({
            method: 'PUT',
            url,
            headers: H['admin']!,
            payload: { items: [{ itemId: item.itemId }, { name: 'Mixer blade', unit: 'each' }] }
        });
        expect(saved.statusCode).toBe(200);

        const list = async () =>
            (
                await app.inject({
                    method: 'GET',
                    url: `/api/v1/suppliers/${supplierId}/items`,
                    headers: H['admin']!
                })
            ).json();
        expect(await list()).toHaveLength(2);

        // Saving without the blade takes it off; the item stays.
        await app.inject({
            method: 'PUT',
            url,
            headers: H['admin']!,
            payload: { items: [{ itemId: item.itemId }] }
        });
        const left = await list();
        expect(left).toHaveLength(1);
        expect(left[0].itemId).toBe(item.itemId);

        const page = (
            await app.inject({
                method: 'GET',
                url: '/api/v1/setup/suppliers?limit=200',
                headers: H['admin']!
            })
        ).json();
        expect(page.items.find((s: { id: number }) => s.id === supplierId).products).toBe(1);
    });
});

describe('sending bad goods back at the door', () => {
    /** Two different items with a purchase pack, for an order of two lines. */
    async function twoOrderable() {
        const rows = await db
            .selectFrom('items')
            .innerJoin('item_packs as p', (join) =>
                join.onRef('p.item_id', '=', 'items.id').on('p.is_default_purchase', '=', true)
            )
            .select(['items.id as itemId', 'p.id as packId', 'p.qty_in_stock_unit as packSize'])
            .where('items.is_active', '=', true)
            .orderBy('items.id')
            .limit(2)
            .execute();
        return rows.map((r) => ({ ...r, packSize: Number(r.packSize) }));
    }

    async function raise(supplierId: number, lines: { itemPackId: number; qtyPacks: number }[]) {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['management']!,
            payload: { supplierId, lines }
        });
        return res.json().id as string;
    }

    it('keeps refused goods out of stock, and reports the delivery to management', async () => {
        const [a, b] = await twoOrderable();
        const supplier = await aSupplier();
        const poId = await raise(supplier.id, [
            { itemPackId: a!.packId, qtyPacks: 10 },
            { itemPackId: b!.packId, qtyPacks: 4 }
        ]);
        const po = await poById(poId, H['management']!);
        const lineA = po.lines.find((l: { itemId: number }) => l.itemId === a!.itemId);
        const lineB = po.lines.find((l: { itemId: number }) => l.itemId === b!.itemId);

        // Ten of A came, two of them bad: a replacement. All four of B bad: a credit.
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                poId,
                lines: [{ itemPackId: a!.packId, qtyPacks: 8 }],
                rejections: [
                    {
                        poLineId: lineA.id,
                        qty: 2,
                        reasonCode: 'RET_DAMAGED',
                        note: 'sacks wet',
                        outcome: 'replacement'
                    },
                    { poLineId: lineB.id, qty: 4, reasonCode: 'RET_QUALITY', outcome: 'credit' }
                ]
            }
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().needsReview).toBe(true);
        const grnId = res.json().id;

        // Only the eight good packs reached the ledger.
        const ledger = await db
            .selectFrom('stock_ledger')
            .select(['item_id', 'qty_base'])
            .where('doc', '=', 'grn')
            .where('doc_id', '=', String(grnId))
            .execute();
        expect(ledger).toHaveLength(1);
        expect(Number(ledger[0]!.qty_base)).toBe(8 * a!.packSize);

        // The replacement is still owed; the credit is not.
        const after = await poById(poId, H['management']!);
        expect(after.status).toBe('ordered');
        const afterA = after.lines.find((l: { id: string }) => l.id === lineA.id);
        const afterB = after.lines.find((l: { id: string }) => l.id === lineB.id);
        expect(afterA.qtyOutstandingBase).toBe(2 * a!.packSize);
        expect(afterB.qtyOutstandingBase).toBe(0);
        expect(afterB.qtyCreditedBase).toBe(4 * b!.packSize);

        // The delivery reads back with what went back.
        const detail = (
            await app.inject({ method: 'GET', url: `/api/v1/grn/${grnId}`, headers: H['storekeeper']! })
        ).json();
        expect(detail.needsReview).toBe(true);
        expect(detail.rejections).toHaveLength(2);
        expect(detail.rejections[0]).toMatchObject({
            reasonCode: 'RET_DAMAGED',
            note: 'sacks wet',
            outcome: 'replacement',
            qty: 2
        });

        // Management sees it as new; the storekeeper has no report list.
        const storeTry = await app.inject({
            method: 'GET',
            url: '/api/v1/delivery-reports',
            headers: H['storekeeper']!
        });
        expect(storeTry.statusCode).toBe(403);

        const unseen = async () =>
            (
                await app.inject({
                    method: 'GET',
                    url: '/api/v1/delivery-reports?unseen=true&limit=200',
                    headers: H['management']!
                })
            ).json();
        const report = (await unseen()).items.find((r: { id: string }) => r.id === String(grnId));
        expect(report).toMatchObject({
            returnedCount: 2,
            outstandingCount: 1,
            creditsPending: 1,
            reviewedAt: null
        });

        // The credit note arrives for B. A was a replacement and has none.
        const rejB = detail.rejections.find((r: { outcome: string }) => r.outcome === 'credit');
        const rejA = detail.rejections.find((r: { outcome: string }) => r.outcome === 'replacement');
        const credited = await app.inject({
            method: 'POST',
            url: `/api/v1/grn-rejections/${rejB.id}/credit-note`,
            headers: H['management']!,
            payload: { creditNoteNo: 'CN-7781' }
        });
        expect(credited.statusCode).toBe(200);
        const wrongKind = await app.inject({
            method: 'POST',
            url: `/api/v1/grn-rejections/${rejA.id}/credit-note`,
            headers: H['management']!,
            payload: { creditNoteNo: 'CN-1' }
        });
        expect(wrongKind.statusCode).toBe(409);

        const seen = await app.inject({
            method: 'POST',
            url: `/api/v1/delivery-reports/${grnId}/seen`,
            headers: H['management']!
        });
        expect(seen.statusCode).toBe(200);
        expect((await unseen()).items.some((r: { id: string }) => r.id === String(grnId))).toBe(false);
    });

    it('refuses to send back more than was owed, or without an order', async () => {
        const [a] = await twoOrderable();
        const supplier = await aSupplier();
        const poId = await raise(supplier.id, [{ itemPackId: a!.packId, qtyPacks: 3 }]);
        const line = (await poById(poId, H['management']!)).lines[0];

        const tooMany = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                poId,
                lines: [],
                rejections: [
                    { poLineId: line.id, qty: 5, reasonCode: 'RET_DAMAGED', outcome: 'credit' }
                ]
            }
        });
        expect(tooMany.statusCode).toBe(400);

        const noOrder = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: {
                supplierId: supplier.id,
                lines: [{ itemPackId: a!.packId, qtyPacks: 1 }],
                rejections: [
                    { poLineId: line.id, qty: 1, reasonCode: 'RET_DAMAGED', outcome: 'credit' }
                ]
            }
        });
        expect(noOrder.statusCode).toBe(400);
    });

    it('does not report a delivery that came complete and good', async () => {
        const [a] = await twoOrderable();
        const supplier = await aSupplier();
        const poId = await raise(supplier.id, [{ itemPackId: a!.packId, qtyPacks: 2 }]);
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/grn',
            headers: { ...H['storekeeper']!, ...idem() },
            payload: { supplierId: supplier.id, poId, lines: [{ itemPackId: a!.packId, qtyPacks: 2 }] }
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().needsReview).toBe(false);
    });

    it('records what each delivery found owing, and flags more than was owed', async () => {
        // Order no. 4 on the live system: three boxes, one kept and one credited
        // on the first lorry, so one still owed when the next lorry came.
        const [a] = await twoOrderable();
        const supplier = await aSupplier();
        const poId = await raise(supplier.id, [{ itemPackId: a!.packId, qtyPacks: 3 }]);
        const line = (await poById(poId, H['management']!)).lines[0];
        const box = a!.packSize;

        const deliver = (qtyPacks: number, rejections: unknown[] = []) =>
            app.inject({
                method: 'POST',
                url: '/api/v1/grn',
                headers: { ...H['storekeeper']!, ...idem() },
                payload: {
                    supplierId: supplier.id,
                    poId,
                    lines: qtyPacks > 0 ? [{ itemPackId: a!.packId, qtyPacks }] : [],
                    rejections
                }
            });
        const arrival = async (grnId: string) =>
            (
                await app.inject({ method: 'GET', url: `/api/v1/grn/${grnId}`, headers: H['management']! })
            ).json().atArrival[0];

        const first = await deliver(1, [
            { poLineId: line.id, qty: 1, reasonCode: 'RET_DAMAGED', outcome: 'credit' }
        ]);
        expect(first.statusCode).toBe(201);
        expect(await arrival(first.json().id)).toMatchObject({
            qtyOrderedBase: 3 * box,
            qtyOwedBeforeBase: 3 * box,
            qtyReceivedBase: box,
            qtyRefusedBase: box,
            qtyCreditedBase: box,
            qtyOverBase: 0,
            qtyOwedAfterBase: box
        });

        // One box was still owed and two came: the second is more than owed.
        // It is still received -- it is here -- but management hears about it.
        // (Once an order is filled it takes no more deliveries at all.)
        const second = await deliver(2);
        expect(second.statusCode).toBe(201);
        expect(second.json().needsReview).toBe(true);
        expect(await arrival(second.json().id)).toMatchObject({
            qtyOwedBeforeBase: box,
            qtyReceivedBase: 2 * box,
            qtyOverBase: box,
            qtyOwedAfterBase: 0
        });
        const reports = (
            await app.inject({
                method: 'GET',
                url: '/api/v1/delivery-reports?limit=100',
                headers: H['management']!
            })
        ).json();
        const row = reports.items.find((r: { id: string }) => r.id === String(second.json().id));
        expect(row).toMatchObject({ overCount: 1, shortCount: 0 });
    });
});

describe('finding an order', () => {
    it('by its number, or by the supplier it went to', async () => {
        const item = await orderable();
        const supplier = await db
            .selectFrom('suppliers')
            .select(['id', 'name'])
            .where('is_active', '=', true)
            .orderBy('id')
            .executeTakeFirstOrThrow();
        const raised = await app.inject({
            method: 'POST',
            url: '/api/v1/purchase-orders',
            headers: H['management']!,
            payload: { supplierId: supplier.id, lines: [{ itemPackId: item.packId, qtyPacks: 1 }] }
        });
        const id = raised.json().id;

        const byNumber = (
            await app.inject({
                method: 'GET',
                url: `/api/v1/purchase-orders?search=${id}`,
                headers: H['management']!
            })
        ).json();
        expect(byNumber.items.map((p: { id: string }) => p.id)).toContain(id);

        const word = supplier.name.split(' ')[0]!.toLowerCase();
        const byName = (
            await app.inject({
                method: 'GET',
                url: `/api/v1/purchase-orders?search=${encodeURIComponent(word)}&limit=200`,
                headers: H['management']!
            })
        ).json();
        expect(byName.total).toBeGreaterThan(0);
        expect(
            byName.items.every((p: { supplierName: string | null }) =>
                (p.supplierName ?? '').toLowerCase().includes(word)
            )
        ).toBe(true);
    });
});

describe('what to order next', () => {
    it('suggests whole packs for everything at or below its reorder point', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/v1/purchase-orders/suggested',
            headers: H['storekeeper']!
        });
        expect(res.statusCode).toBe(200);

        const rows = res.json();
        for (const row of rows) {
            expect(row.inStore).toBeLessThanOrEqual(row.reorderPoint);
            // Whole packs, and never an order for nothing.
            if (row.itemPackId !== null) {
                expect(row.suggestedPacks).toBeGreaterThan(0);
                expect(Number.isInteger(row.suggestedPacks)).toBe(true);
            }
        }

        // The kitchen has no business ordering for the store.
        const kitchen = await app.inject({
            method: 'GET',
            url: '/api/v1/purchase-orders/suggested',
            headers: H['kitchen']!
        });
        expect(kitchen.statusCode).toBe(403);
    });
});

describe('opening stock', () => {
    it('opens a fresh section once, and refuses the second time', async () => {
        // A brand new branch is the only place with a section that has never
        // moved -- which is the state this document exists for.
        const code = `OP${tag().slice(0, 4)}`;
        const branch = await app.inject({
            method: 'POST',
            url: '/api/v1/setup/branches',
            headers: H['admin']!,
            payload: { code, name: `Opening test ${code}` }
        });
        expect(branch.statusCode).toBe(201);
        const { id: locationId, storeSectionId } = branch.json();

        // Signed in after the branch exists, or the token would not carry it.
        const mgmt = await signIn('management', locationId);

        const waiting = (
            await app.inject({ method: 'GET', url: '/api/v1/opening-stock', headers: mgmt })
        ).json();
        expect(waiting.find((s: { sectionId: number }) => s.sectionId === storeSectionId).canOpen).toBe(
            true
        );

        const item = await orderable();
        const opened = await app.inject({
            method: 'POST',
            url: '/api/v1/opening-stock',
            headers: { ...mgmt, ...idem() },
            payload: {
                sectionId: storeSectionId,
                note: 'counted at handover',
                lines: [{ itemId: item.itemId, qtyBase: 5000 }]
            }
        });
        expect(opened.statusCode).toBe(201);

        // The stock is really there.
        const onShelf = await db
            .selectFrom('current_stock')
            .select('qty_base')
            .where('section_id', '=', storeSectionId)
            .where('item_id', '=', item.itemId)
            .executeTakeFirstOrThrow();
        expect(Number(onShelf.qty_base)).toBe(5000);

        // Second time is a stock count's job, not an opening balance's.
        const again = await app.inject({
            method: 'POST',
            url: '/api/v1/opening-stock',
            headers: { ...mgmt, ...idem() },
            payload: {
                sectionId: storeSectionId,
                lines: [{ itemId: item.itemId, qtyBase: 100 }]
            }
        });
        expect(again.statusCode).toBe(409);
        expect(again.json().message).toContain('stock count');
    });

    it('is not something the admin can do', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/opening-stock',
            headers: { ...H['admin']!, ...idem() },
            payload: { sectionId: 1, lines: [{ itemId: 1, qtyBase: 1 }] }
        });
        expect(res.statusCode).toBe(403);
    });
});
