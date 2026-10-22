import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TRow = { id: string; title: string; n: number };

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });
    const rows = rowsService.createStoreSlot(db);
    const updateRow = (key: string, patch: Partial<TRow>): void => {
        const rowSlot = rowsService.findSlotByKey(rows, key);
        if (rowSlot !== undefined) rowsService.slotContentService.updateEntity(rowSlot, patch);
    };
    return { db, effectService, rowsService, rows, updateRow };
};

/** The row every case below reads, with the first write already delivered. */
const settled = () => {
    const { db, effectService, rowsService, rows, updateRow } = createFixture();
    rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'gamma', n: 0 });
    db.flush();
    return { db, effectService, rowsService, rows, updateRow, slot: rowsService.getSlotByKey(rows, 'r1') };
};

const titleLengthOf = (slot: TOIMEntitySlot<TRow, TOIMStoreKey>) =>
    (slot.entity?.title ?? '').length;

const createDerived = (
    db: OIMDB,
    sourceSlots: readonly TOIMSlot[],
    sourceComputeds: ReadonlyArray<() => TOIMComputedSlot>,
    derive: () => number,
    sameValueGuard: (a: number, b: number) => boolean = oimSameValueZeroGuard,
) => {
    const computedService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard,
    });
    const derived = computedService.createComputedStoreSlot(
        db,
        derive,
        () => ({ sourceSlots, sourceComputeds: sourceComputeds.map(source => source()) }),
    );
    const derivedService = {
        getSlotByKey: (storeSlot: typeof derived, key: undefined) => computedService.computedCollectionService.getSlotByKey(storeSlot, key),
        getValueByKey: (storeSlot: typeof derived, key: undefined) => {
            const computedSlot = computedService.computedCollectionService.getSlotByKey(storeSlot, key);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
    return { derivedService, derived };
};

describe('a derivation is asked, never woken', () => {
    it('derives nothing at construction, and the right value on the first settle', () => {
        const { db, slot } = settled();

        let derivations = 0;
        const { derivedService: titleLengthService, derived: titleLength } = createDerived(
            db, [slot], [], () => { derivations++; return titleLengthOf(slot); },
        );
        expect(derivations).toBe(0);

        titleLengthService.getValueByKey(titleLength, undefined);
        expect(derivations).toBe(1);
        expect(titleLengthService.getValueByKey(titleLength, undefined)).toBe(5);
    });

    it('tells an effect that reads it in the same frame that changed it', () => {
        const { db, effectService, updateRow, slot } = settled();
        const { derivedService: titleLengthService, derived: titleLength } = createDerived(db, [slot], [], () => titleLengthOf(slot));

        let runCount = 0;
        effectService.createEffect(db, [], [titleLengthService.getSlotByKey(titleLength, undefined)], () => { runCount++; });
        // Born between frames with nothing written since the last flush: it
        // inherits nothing and is owed nothing.
        db.flush();
        expect(runCount).toBe(0);

        updateRow('r1', { title: 'alphaalpha' });
        db.flush();
        expect(runCount).toBe(1);
        expect(titleLengthService.getValueByKey(titleLength, undefined)).toBe(10);
    });

    /**
     * THE DIAMOND, WHICH IS WHAT THE LEVELS ARE HELD TO. No node carries a level
     * and no queue is kept per level. What that arithmetic would buy — a reader
     * never seeing a half-built frame — is bought instead by a derivation
     * settling its own sources before it derives, so the counts and the settled
     * sink value below are the whole of the promise.
     */
    it('derives every node of a diamond exactly once per frame, on settled inputs', () => {
        const { db, effectService, updateRow, slot } = settled();

        let baseRuns = 0;
        let leftRuns = 0;
        let rightRuns = 0;
        let sinkRuns = 0;
        const { derivedService: baseService, derived: base } = createDerived(db, [slot], [], () => { baseRuns++; return titleLengthOf(slot); });
        const { derivedService: leftService, derived: left } = createDerived(
            db, [], [() => baseService.getSlotByKey(base, undefined)], () => { leftRuns++; return baseService.getValueByKey(base, undefined) * 2; },
        );
        const { derivedService: rightService, derived: right } = createDerived(
            db, [], [() => baseService.getSlotByKey(base, undefined)], () => { rightRuns++; return baseService.getValueByKey(base, undefined) + 1; },
        );
        const { derivedService: sinkService, derived: sink } = createDerived(
            db, [], [() => leftService.getSlotByKey(left, undefined), () => rightService.getSlotByKey(right, undefined)],
            () => { sinkRuns++; return leftService.getValueByKey(left, undefined) + rightService.getValueByKey(right, undefined); },
        );
        effectService.createEffect(db, [], [sinkService.getSlotByKey(sink, undefined)], () => { /* the reader that makes the sink asked */ });

        // A first settle, so the frame below has a previous value to be a stale
        // mix OF. 'gamma' is 5, so left is 10 and right is 6.
        sinkService.getValueByKey(sink, undefined);
        expect(sinkService.getValueByKey(sink, undefined)).toBe(16);
        baseRuns = leftRuns = rightRuns = sinkRuns = 0;

        updateRow('r1', { title: 'gammagamma' });
        db.flush();

        expect([baseRuns, leftRuns, rightRuns, sinkRuns]).toEqual([1, 1, 1, 1]);
        // `base` is reached twice — once through `left`, once through `right` —
        // and derives once, because the second settle finds its own reading
        // already at the clock.
        //
        // And the sink saw SETTLED inputs: base went 5 -> 10, so left = 20,
        // right = 11, sink = 31, never a mix of one frame's left with the last
        // frame's right.
        expect(sinkService.getValueByKey(sink, undefined)).toBe(20 + 11);
    });

    it('wakes nobody when the derived value did not move', () => {
        const { db, effectService, updateRow, slot } = settled();
        const { derivedService: titleLengthService, derived: titleLength } = createDerived(db, [slot], [], () => titleLengthOf(slot));

        let runCount = 0;
        effectService.createEffect(db, [], [titleLengthService.getSlotByKey(titleLength, undefined)], () => { runCount++; });
        db.flush();

        // The identical string: nothing moved at the SOURCE either, so the write
        // path itself reports nothing and the effect is never even woken.
        updateRow('r1', { title: 'gamma' });
        db.flush();
        expect(runCount).toBe(0);

        titleLengthService.getValueByKey(titleLength, undefined);
        expect(titleLengthService.getValueByKey(titleLength, undefined)).toBe(5);
    });

    it('honours a `held` of the caller\'s, and reports only what it calls a move', () => {
        const { db, effectService, updateRow, slot } = settled();
        // Two lengths are "the same" so long as both are non-zero — artificial
        // on purpose, because `oimSameValueZeroGuard` would NOT call 6 and 10 the same,
        // so the silence below can only come from this function being consulted.
        const { derivedService: titleLengthService, derived: titleLength } = createDerived(
            db, [slot], [], () => titleLengthOf(slot), (a, b) => (a > 0) === (b > 0),
        );

        let runCount = 0;
        effectService.createEffect(db, [], [titleLengthService.getSlotByKey(titleLength, undefined)], () => { runCount++; });

        // A real write first, so the derivation has a reading of its own for the
        // `held` to be asked against.
        updateRow('r1', { title: 'gamma!' });
        db.flush();
        expect(runCount).toBe(1);
        runCount = 0;

        updateRow('r1', { title: 'alphaalpha' });   // 6 -> 10, both > 0
        db.flush();
        expect(runCount).toBe(0);

        // What `held` decides is who is WOKEN, and that is what is
        // asserted. Which of the two values the derivation keeps once its
        // `held` has called them the same is an internal choice — under a
        // real `held` the two are interchangeable, and only this deliberately
        // artificial one could tell them apart at all.
        updateRow('r1', { title: '' });             // 10 -> 0: a real move
        db.flush();
        expect(runCount).toBe(1);
        expect(titleLengthService.getValueByKey(titleLength, undefined)).toBe(0);
    });
});

describe('an effect is the only thing a frame runs', () => {
    it('runs on a change to what it reads', () => {
        const { db, effectService, updateRow, slot } = settled();
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });

        updateRow('r1', { title: 'zzz' });
        db.flush();
        expect(runs).toBe(1);
    });

    it('stops running once detached', () => {
        const { db, effectService, updateRow, slot } = settled();
        let runs = 0;
        const effect = effectService.createEffect(db, [slot], [], () => { runs++; });

        updateRow('r1', { title: 'zzz' });
        db.flush();
        const before = runs;

        effectService.disposeEffect(effect);
        updateRow('r1', { title: 'yyy' });
        db.flush();
        expect(runs).toBe(before);
    });

    it('leaves its root\'s dependent list on the way out', () => {
        const { db, effectService, slot } = settled();
        // ONE LIST. A derivation's reader and a subscriber's handler are the
        // same kind of dependent — a `TOIMEffect` in `slot.effects`.
        const effect = effectService.createEffect(db, [slot], [], () => { /* the bookkeeping is what is under test */ });
        expect(slot.effects?.length).toBe(1);

        effectService.disposeEffect(effect);
        expect(slot.effects?.length).toBe(0);
    });

    it('does not run when detached between the write and the flush', () => {
        const { db, effectService, updateRow, slot } = settled();
        let runs = 0;
        const effect = effectService.createEffect(db, [slot], [], () => { runs++; });

        // The window the other detach cases do not cover: the write has already
        // put this effect on the frame's list, and its owner lets it go before
        // the frame opens. Taking the edges out is not enough — the frame decides
        // from the effect's own stamp — so the body ran once more, which for a
        // React effect is a run after unmount.
        updateRow('r1', { title: 'zzz' });
        effectService.disposeEffect(effect);
        db.flush();
        expect(runs).toBe(0);
    });

    it('neither derives nor runs when the last reader detaches before the flush', () => {
        const { db, effectService, updateRow, slot } = settled();
        let derivations = 0;
        const { derivedService: titleLengthService, derived: titleLength } = createDerived(
            db, [slot], [], () => { derivations++; return titleLengthOf(slot); },
        );
        let runCount = 0;
        const effect = effectService.createEffect(db, [], [titleLengthService.getSlotByKey(titleLength, undefined)], () => { runCount++; });
        db.flush();
        derivations = 0;
        runCount = 0;

        updateRow('r1', { title: 'gammagamma' });
        effectService.disposeEffect(effect);
        db.flush();

        expect(derivations).toBe(0);
        expect(runCount).toBe(0);
    });

    it('leaves one reader of a derivation reading it when another detaches', () => {
        const { db, effectService, updateRow, slot } = settled();
        const { derivedService: valueService, derived: value } = createDerived(db, [slot], [], () => titleLengthOf(slot));
        let watcherRuns = 0;
        let keptRuns = 0;
        const watcher = effectService.createEffect(db, [], [valueService.getSlotByKey(value, undefined)], () => { watcherRuns++; });
        const kept = effectService.createEffect(db, [], [valueService.getSlotByKey(value, undefined)], () => { keptRuns++; });

        updateRow('r1', { title: 'ab' });
        db.flush();
        const before = watcherRuns;

        effectService.disposeEffect(watcher);
        updateRow('r1', { title: 'abcdef' });
        db.flush();

        expect(watcherRuns).toBe(before);
        // Only the watcher's OWN edges went; the derivation is still read, still
        // settled, and the other reader still hears about it.
        expect(keptRuns).toBe(2);
        expect(valueService.getValueByKey(value, undefined)).toBe(6);
        effectService.disposeEffect(kept);
    });
});

describe('when a node was born decides which frames it hears about', () => {
    it('does not settle a derivation built behind a write to a row nobody held, and settles it on the next write', () => {
        const { db, effectService, updateRow, slot } = settled();

        updateRow('r1', { title: 'ab' });

        let derivations = 0;
        const { derivedService: titleLengthService, derived: titleLength } = createDerived(
            db, [slot], [], () => { derivations++; return titleLengthOf(slot); },
        );
        expect(derivations).toBe(0);

        let seen = -1;
        effectService.createEffect(db, [], [titleLengthService.getSlotByKey(titleLength, undefined)], () => { seen = titleLengthService.getValueByKey(titleLength, undefined); });
        db.flush();

        expect(derivations).toBe(0);
        expect(seen).toBe(-1);

        updateRow('r1', { title: 'abcd' });
        db.flush();
        expect(derivations).toBe(1);
        expect(seen).toBe(4);
    });
});

describe('what a write reaches, and what only the caller reaches', () => {
    it('wakes the slot and the column a write moved, and never a bucket', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        const byDeckService = createOIMBucketService<
            TOIMEntitySlot<TRow, TOIMStoreKey>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TRow, TOIMStoreKey>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow, TOIMStoreKey>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow, TOIMStoreKey>>() });

        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'gamma', n: 0 });
        db.flush();
        const slot = rowsService.getSlotByKey(rows, 'r1');

        // A bucket's slots are written BY HAND, because that is the only way
        // they are ever written. The hold is what keeps the bucket while this
        // test holds it.
        const byDeck = byDeckService.createStoreSlot(db);
        const deckSlot = byDeckService.holdSlotByKey(byDeck, 'd1');
        byDeckService.slotContentService.writeBucketMemberSlots(deckSlot, [slot]);
        db.flush();
        const bucketSlotsService = [...byDeckService.slotContentService.getBucketMemberSlots(deckSlot)];
        expect(bucketSlotsService.length).toBe(1);
        expect(bucketSlotsService[0]).toBe(slot);

        let slotWoke = 0;
        let columnWoke = 0;
        let deckWoke = 0;
        effectService.createEffect(db, [slot], [], () => { slotWoke++; });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { columnWoke++; });
        effectService.createEffect(db, [deckSlot], [], () => { deckWoke++; });
        db.flush();

        updateRow('r1', { title: 'delta' });
        db.flush();
        expect(slotWoke).toBe(1);
        expect(columnWoke).toBe(1);
        // A WRITE TAKES NO SLOT INTO OR OUT OF A BUCKET.
        expect(deckWoke).toBe(0);

        // Nor does a slot arriving in the collection.
        rowsService.slotContentService.upsertEntity(rows, { id: 'r2', title: 'zeta', n: 0 });
        db.flush();
        expect(deckWoke).toBe(0);

        // And the one thing that does: the caller writing the list.
        byDeckService.slotContentService.writeBucketMemberSlots(deckSlot, [slot, rowsService.getSlotByKey(rows, 'r2')]);
        db.flush();
        expect(deckWoke).toBe(1);

        deckSlot.owner.unholdSlot(deckSlot);
    });
});
