import type { TOIMEntitySlot } from '@oimdb/core';
import { exoPositionalList } from '../src/exoPositionalList';
import { applyOp } from './support/applyOp';
import { build } from './support/build';
import type { TCard } from './support/build';

const idOf = (slot: TOIMEntitySlot): string => (slot.entity as TCard).id;

/**
 * The other arm of the list fork: a bucket whose order is the CALLER'S, where
 * the engine already recorded the script and nothing is diffed.
 *
 * The invariant every case checks is the consumer's: starting from `snapshot()`
 * and applying every op reproduces what the bridge itself answers next.
 */
describe('exoPositionalList', () => {
    it('snapshots the placed list and forwards the caller\'s own commands', () => {
        const world = build();
        const bucket = world.bucketOf(world.boardService, world.board, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        const three = world.slotOf({ id: 'c3', deckId: 'd', rank: 3, title: 'three' });
        world.appendTo(bucket, one);
        world.appendTo(bucket, two);
        world.appendTo(bucket, three);
        world.db.flush();

        const list = exoPositionalList(world.db, world.boardService.slotContentService, bucket, idOf);
        expect(list.snapshot()).toEqual(['c1', 'c2', 'c3']);

        const applied = [...list.snapshot()];
        const ops: unknown[] = [];
        list.subscribeOps(op => { ops.push(op); applyOp(applied, op); });

        world.boardService.slotContentService.moveBucketMemberSlotToPosition(bucket, 0, 2);
        world.db.flush();
        // The command the caller wrote, not one derived from two lists.
        expect(ops).toEqual([{ type: 'move', from: 0, to: 2 }]);
        expect(applied).toEqual(['c2', 'c3', 'c1']);
        expect(applied).toEqual(list.snapshot());

        world.boardService.slotContentService.removeBucketMemberSlotAt(bucket, 0);
        world.db.flush();
        expect(ops).toContainEqual({ type: 'remove', index: 0 });
        expect(applied).toEqual(['c3', 'c1']);
        expect(applied).toEqual(list.snapshot());

        list.dispose();
    });

    /**
     * The script lives for one frame, and a subscriber is woken by every frame
     * that wrote this bucket — so a frame it was NOT woken in changed nothing.
     */
    it('a quiet frame in between does not force a rebuild', () => {
        const world = build();
        const bucket = world.bucketOf(world.boardService, world.board, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.appendTo(bucket, one);
        world.appendTo(bucket, two);
        world.db.flush();

        const list = exoPositionalList(world.db, world.boardService.slotContentService, bucket, idOf);
        const ops: unknown[] = [];
        list.subscribeOps(op => ops.push(op));

        // Two frames in which nothing touched this bucket.
        world.db.flush();
        world.db.flush();

        world.boardService.slotContentService.moveBucketMemberSlotToPosition(bucket, 0, 1);
        world.db.flush();
        expect(ops).toEqual([{ type: 'move', from: 0, to: 1 }]);
        expect(list.snapshot()).toEqual(['c2', 'c1']);

        list.dispose();
    });

    /**
     * Built in the middle of a batch, and then written again inside that same
     * batch: the snapshot carries what landed before the bridge existed, the
     * script carries what landed after it, and neither is counted twice.
     */
    it('a bridge built mid-batch reports the batch exactly once', () => {
        const world = build();
        const bucket = world.bucketOf(world.boardService, world.board, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.appendTo(bucket, one);

        const list = exoPositionalList(world.db, world.boardService.slotContentService, bucket, idOf);
        const applied = [...list.snapshot()];
        expect(applied).toEqual(['c1']);
        list.subscribeOps(op => applyOp(applied, op));

        // Still the same batch, still the same frame's script.
        world.appendTo(bucket, two);
        world.db.flush();

        expect(applied).toEqual(['c1', 'c2']);
        expect(applied).toEqual(list.snapshot());

        list.dispose();
    });

    /**
     * A `reset` is the service's own decision, taken when the script grows past
     * the list it describes. It must come back through the same per-slot memo, or
     * an identity-reconciling renderer rebuilds every row it already had.
     */
    it('maps a reset through the same memo, so a collapsed script keeps its rows', () => {
        const world = build();
        const bucket = world.bucketOf(world.boardService, world.board, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.appendTo(bucket, one);
        world.appendTo(bucket, two);
        world.db.flush();

        let renders = 0;
        const list = exoPositionalList(world.db, world.boardService.slotContentService, bucket, slot => {
            renders++;
            return { id: idOf(slot) };
        });
        const first = list.snapshot();
        expect(first.map(row => row.id)).toEqual(['c1', 'c2']);
        expect(renders).toBe(2);

        let items: readonly { id: string }[] | undefined;
        list.subscribeOps(op => { if (op.type === 'reset') items = op.items; });

        // Three commands against a list of two: the service collapses them.
        world.boardService.slotContentService.moveBucketMemberSlotToPosition(bucket, 0, 1);
        world.boardService.slotContentService.moveBucketMemberSlotToPosition(bucket, 0, 1);
        world.boardService.slotContentService.moveBucketMemberSlotToPosition(bucket, 0, 1);
        world.db.flush();

        expect(items?.map(row => row.id)).toEqual(['c2', 'c1']);
        expect(renders).toBe(2);
        expect(items?.[0]).toBe(first[1]);
        expect(items?.[1]).toBe(first[0]);
        expect(list.snapshot()).toEqual(items);

        list.dispose();
    });

    /**
     * `writeBucketMemberSlots` evicts and refills, so `OIMBucketCommands`
     * asks for the whole list instead of a script. A consumer woken by a
     * whole-bucket write is handed the list, never a placement into a list it no
     * longer holds.
     */
    it('a write of a bucket\'s slots that recorded no script still reaches the consumer', () => {
        const world = build();
        const bucket = world.bucketOf(world.boardService, world.board, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.appendTo(bucket, one);
        world.db.flush();

        const list = exoPositionalList(world.db, world.boardService.slotContentService, bucket, idOf);
        const applied = [...list.snapshot()];
        list.subscribeOps(op => applyOp(applied, op));

        world.boardService.slotContentService.writeBucketMemberSlots(bucket, [two, one]);
        world.db.flush();

        expect(applied).toEqual(['c2', 'c1']);
        expect(applied).toEqual(list.snapshot());

        list.dispose();
    });

    it('stops delivering after dispose, and disposing twice is harmless', () => {
        const world = build();
        const bucket = world.bucketOf(world.boardService, world.board, 'main');
        const one = world.slotOf({ id: 'c1', deckId: 'd', rank: 1, title: 'one' });
        world.appendTo(bucket, one);
        world.db.flush();

        const list = exoPositionalList(world.db, world.boardService.slotContentService, bucket, idOf);
        const ops: unknown[] = [];
        list.subscribeOps(op => ops.push(op));

        list.dispose();
        list.dispose();

        const two = world.slotOf({ id: 'c2', deckId: 'd', rank: 2, title: 'two' });
        world.appendTo(bucket, two);
        world.db.flush();
        expect(ops).toHaveLength(0);
        expect(list.snapshot()).toEqual(['c1']);
    });
});
