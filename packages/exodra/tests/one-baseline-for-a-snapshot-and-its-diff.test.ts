import type { TOIMEntitySlot } from '@oimdb/core';
import { exoDerivedList } from '../src/exoDerivedList';
import { applyOp } from './support/applyOp';
import { build } from './support/build';
import type { TCard } from './support/build';

const idOf = (slot: TOIMEntitySlot): string => (slot.entity as TCard).id;

/**
 * The arm of the list fork for an order computed: the script is derived, by
 * `oimOrderedListCommandsOfTransition`, from the derivation
 * `createOIMComputedServiceBucketMemo` files per key or from an index order.
 *
 * ONE BASELINE is what every case here is really about. `applied` is both what
 * `snapshot()` answers and the `prev` the diff is taken against, and it moves in
 * exactly two places — construction, and the effect body — so a consumer that
 * starts from the snapshot and applies every op cannot be one place off.
 */
describe('exoDerivedList', () => {
    it('snapshots the current order and applies incremental ops for a reorder', () => {
        const world = build();
        const orderSlot = world.rankedOrdersService.holdSlotByKey(world.rankedOrders, 'd');
        world.cardsService.slotContentService.upsertEntities(world.cards, [
            { id: 'c3', deckId: 'd', rank: 3, title: 'three' },
            { id: 'c1', deckId: 'd', rank: 1, title: 'one' },
            { id: 'c2', deckId: 'd', rank: 2, title: 'two' },
        ]);
        world.db.flush();

        const list = exoDerivedList(world.db, orderSlot, idOf);
        expect(list.snapshot()).toEqual(['c1', 'c2', 'c3']);

        const ops: unknown[] = [];
        list.subscribeOps(op => ops.push(op));

        world.updateCard('c1', { rank: 99 });
        world.db.flush();

        expect(ops).toEqual([{ type: 'move', from: 0, to: 2 }]);
        expect(list.snapshot()).toEqual(['c2', 'c3', 'c1']);

        list.dispose();
        orderSlot.owner.unholdSlot(orderSlot);
    });

    it('maps insert and remove the same way, and renders each row once', () => {
        const world = build();
        const bucket = world.bucketOf(world.rankedService, world.ranked, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one, two]);
        world.db.flush();

        const heldSlot = world.orderService.holdSlotByKey(world.order, 'main');
        let renders = 0;
        const list = exoDerivedList(world.db, heldSlot, slot => {
            renders++;
            return { id: idOf(slot) };
        });

        const first = list.snapshot();
        expect(renders).toBe(2);
        const again = list.snapshot();
        expect(again[0]).toBe(first[0]);
        expect(again[1]).toBe(first[1]);
        expect(renders).toBe(2);

        const ops: unknown[] = [];
        list.subscribeOps(op => ops.push(op));

        const three = world.slotOf({ id: 'c3', deckId: 'd', rank: 3, title: 'three' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one, two, three]);
        world.db.flush();
        expect(ops).toEqual([{ type: 'insert', index: 2, item: { id: 'c3' } }]);

        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [two, three]);
        world.db.flush();
        expect(ops).toContainEqual({ type: 'remove', index: 0 });
        expect(list.snapshot().map(row => row.id)).toEqual(['c2', 'c3']);

        list.dispose();
        heldSlot.owner.unholdSlot(heldSlot);
    });

    /**
     * `snapshot()` must not read through a call that SETTLES the bucket's slots
     * while the diff still holds the pre-write baseline: a row written and not yet
     * flushed would be in the snapshot and arrive a second time as an `insert`,
     * putting every position-addressed command after it one place off.
     *
     * Both orders are pinned, because the bridge is what decides which baseline
     * it is on: built BEFORE the unflushed writes it must report them, built
     * AFTER them it must report nothing.
     */
    it('does not count a row written before the flush twice — bridge built first', () => {
        const world = build();
        const bucket = world.bucketOf(world.rankedService, world.ranked, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one, two]);
        world.db.flush();

        const heldSlot = world.orderService.holdSlotByKey(world.order, 'main');
        const list = exoDerivedList(world.db, heldSlot, idOf);

        // Written, NOT flushed — the ordinary shape of a view built during a
        // batch of writes.
        const three = world.slotOf({ id: 'c3', deckId: 'd', rank: 3, title: 'three' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one, two, three]);

        const applied = [...list.snapshot()];
        list.subscribeOps(op => applyOp(applied, op));

        world.db.flush();
        expect(applied).toEqual(['c1', 'c2', 'c3']);
        expect(applied).toEqual(list.snapshot());

        list.dispose();
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('does not count a row written before the flush twice — bridge built last', () => {
        const world = build();
        const bucket = world.bucketOf(world.rankedService, world.ranked, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one, two]);
        world.db.flush();

        const three = world.slotOf({ id: 'c3', deckId: 'd', rank: 3, title: 'three' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one, two, three]);

        const heldSlot = world.orderService.holdSlotByKey(world.order, 'main');
        const list = exoDerivedList(world.db, heldSlot, idOf);
        const applied = [...list.snapshot()];
        expect(applied).toEqual(['c1', 'c2', 'c3']);
        list.subscribeOps(op => applyOp(applied, op));

        // The rows were already in the snapshot, so the frame that delivers them
        // has nothing to say.
        world.db.flush();
        expect(applied).toEqual(['c1', 'c2', 'c3']);

        list.dispose();
        heldSlot.owner.unholdSlot(heldSlot);
    });

    /**
     * `reset` is the stream's decision rather than the diff's, taken when the
     * script would be larger than `maxCommandsPerSlot` allows — and it is the one command
     * carrying a whole list of slots to map. A consumer that renders per row has
     * to get the SAME row objects back out of it, or an identity-reconciling
     * renderer tears down and rebuilds every row it already had.
     */
    it('maps a reset through the same memo, so a reordered list keeps its rows', () => {
        const world = build();
        const orderSlot = world.rankedOrdersService.holdSlotByKey(world.rankedOrders, 'd');
        world.cardsService.slotContentService.upsertEntities(world.cards, [
            { id: 'c1', deckId: 'd', rank: 1, title: 'one' },
            { id: 'c2', deckId: 'd', rank: 2, title: 'two' },
            { id: 'c3', deckId: 'd', rank: 3, title: 'three' },
        ]);
        world.db.flush();

        let renders = 0;
        // Three items reversed is two commands against a list of three, which is
        // over half of it — so this bridge would rather be handed the new list.
        const list = exoDerivedList(world.db, orderSlot, slot => {
            renders++;
            return { id: idOf(slot) };
        }, 0.5);

        const first = list.snapshot();
        expect(first.map(row => row.id)).toEqual(['c1', 'c2', 'c3']);
        expect(renders).toBe(3);

        const ops: unknown[] = [];
        let items: readonly { id: string }[] | undefined;
        list.subscribeOps(op => {
            ops.push(op);
            if (op.type === 'reset') items = op.items;
        });

        world.updateCard('c1', { rank: 30 });
        world.updateCard('c3', { rank: 0 });
        world.db.flush();

        expect(ops).toEqual([{ type: 'reset', items: [{ id: 'c3' }, { id: 'c2' }, { id: 'c1' }] }]);
        // Nothing arrived and nothing left, so nothing was rendered again.
        expect(renders).toBe(3);
        expect(items?.[0]).toBe(first[2]);
        expect(items?.[2]).toBe(first[0]);

        list.dispose();
        orderSlot.owner.unholdSlot(orderSlot);
    });

    /**
     * The bridge is ATTACHED from construction, not from its first subscriber:
     * that is what lets `snapshot()` promise the list every later op is measured
     * against. `dispose` is what ends it, and after it nothing is delivered.
     */
    it('tracks with nobody subscribed, and stops delivering after dispose', () => {
        const world = build();
        const bucket = world.bucketOf(world.rankedService, world.ranked, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one]);
        world.db.flush();

        const heldSlot = world.orderService.holdSlotByKey(world.order, 'main');
        const list = exoDerivedList(world.db, heldSlot, idOf);

        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one, two]);
        world.db.flush();
        // Nobody was listening, and the baseline still moved.
        expect(list.snapshot()).toEqual(['c1', 'c2']);

        const ops: unknown[] = [];
        const off = list.subscribeOps(op => ops.push(op));
        list.dispose();
        list.dispose();

        world.rankedService.slotContentService.writeBucketMemberSlots(bucket, [one]);
        world.db.flush();
        expect(ops).toHaveLength(0);
        expect(list.snapshot()).toEqual(['c1', 'c2']);

        off();
        heldSlot.owner.unholdSlot(heldSlot);
    });
});
