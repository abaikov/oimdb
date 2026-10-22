/**
 * A COLUMN THAT IS NOT EQUAL TO ITSELF — the value half of a question this
 * engine had already answered about keys, and had answered the other way.
 *
 * `same-key-and-what-a-map-would-say.test.ts` settled the ADDRESS half:
 * `oimSameValueZeroGuard` decides "the same key" as a `Map` does, by SameValueZero, so
 * `NaN` is a key like any other. What was left unsettled was the same
 * value one call earlier — "did this column move?" — which three write-path
 * defaults answered by hand with `(a, b) => a === b`:
 *
 *   - `createOIMEntityWriterInPlace`, which every collection takes through
 *     `createOIMEntityWriterInPlace()`;
 *   - `createOIMEntityWriterReplacing`;
 *   - the equality gate of a derivation, which is a computed slot's `sameValueGuard`.
 *
 * So one write held two answers about one value. The strategy said the `NaN`
 * column changed — the collection then recorded it, marked the slot and the
 * collection, and drove the reindex — and the index it drove asked
 * `isAddressedBy`, which is `oimSameValueZeroGuard`, which said the slot had not moved at all.
 * A poll re-sending unchanged entities therefore woke every subscriber of every
 * such slot for ever, and under `createOIMEntityWriterReplacing` allocated a fresh entity and
 * handed a new reference to every reader that compares by reference. Nothing
 * threw.
 *
 * The three defaults are one module now, `oimSameValueZeroGuard`, and this file is what
 * makes that a decision rather than a coincidence.
 *
 * A WRITE NO LONGER DRIVES A REINDEX AT ALL — a bucket's slots are the caller's, and
 * nothing routes a displaced column to a key store. That removes the path the
 * disagreement travelled and not the disagreement: the two rules are still two
 * hand-written functions asked about one value, one at the write and one at the
 * key, so the case below asks them both directly.
 *
 * AND `isAddressedBy` WENT WITH THE BUCKET KEY STORES. A bucket is filed in an
 * ordinary `OIMSlotStoreServiceMapDriven`, which is a `Map` — so the store's rule
 * is the container's, asked below by resolving the same `NaN` key twice, beside
 * `oimSameValueZeroGuard` asked directly.
 */
import { OIMDB } from '../src/factories/OIMDB';
import { OIMEffectService } from '../src/engine/computed/OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../src/engine/store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../src/engine/slot/utils/oimSameValueZeroGuard';
import { createOIMEntityService } from '../src/factories/createOIMEntityService';
import { createOIMBucketService } from '../src/factories/createOIMBucketService';
import { createOIMComputedService } from '../src/factories/createOIMComputedService';
import { createOIMEntityWriterInPlace } from '../src/factories/createOIMEntityWriterInPlace';
import { createOIMEntityWriterReplacing } from '../src/factories/createOIMEntityWriterReplacing';
import { OIMSlotContentBucketServiceSetDriven } from '../src/facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { IOIMEntityWriter } from '../src/engine/entity/interfaces/IOIMEntityWriter';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../src/engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../src/engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMComputedSlot } from '../src/engine/computed/types/TOIMComputedSlot';
import type { TOIMSingleSlotStore } from '../src/engine/store/types/TOIMSingleSlotStore';

type TReading = { id: string; score: number; label: string };

/**
 * A channel and a collection reporting into it. The write strategy is a
 * parameter because two of the cases below are about which strategy answers:
 * the default in-place one, and `createOIMEntityWriterReplacing`.
 */
const createFixture =(strategy: IOIMEntityWriter = createOIMEntityWriterInPlace()) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const readingsService = createOIMEntityService<TReading>(db, {
        keyOf: (reading: TReading) => reading.id,
        entityWriter: strategy,
    });
    const readings = readingsService.createStoreSlot(db);
    const updateReading = (key: string, patch: Partial<TReading>): void => {
        const readingSlot = readingsService.findSlotByKey(readings, key);
        if (readingSlot !== undefined) readingsService.slotContentService.updateEntity(readingSlot, patch);
    };
    return { db, effectService, readingsService, readings, updateReading };
};

describe('a column that is not equal to itself', () => {
    /**
     * The default strategy, which is what every collection that named none has.
     * A write that puts the same `NaN` back is not a write.
     */
    it('does not report a NaN column as moved when the same NaN is written back', () => {
        const { db, effectService, readingsService, readings, updateReading } = createFixture();

        readingsService.slotContentService.upsertEntity(readings,{ id: 'r1', score: Number('not a number'), label: 'x' });
        db.flush();
        const slot = readingsService.getSlotByKey(readings, 'r1');

        let slotWoke = 0;
        let columnWoke = 0;
        // The two things a write reports — the slot and the columns it moved.
        // `OIMSlotContentEntityStrategy` writes both, so a column
        // wrongly called displaced is heard on either of them.
        effectService.createEffect(db, [slot], [], () => { slotWoke++; });
        effectService.createEffect(db, [readingsService.holdColumn(slot, 'score')], [], () => { columnWoke++; });
        db.flush();
        slotWoke = 0;
        columnWoke = 0;

        // The value did not move — it was NaN and it still is. Three shapes
        // produce it and none of them is a caller typing `NaN`.
        updateReading('r1',{ score: Number('still not a number') });
        db.flush();
        updateReading('r1',{ score: Number(undefined) });
        db.flush();
        updateReading('r1',{ score: Number.NaN });
        db.flush();

        expect(slotWoke).toBe(0);
        expect(columnWoke).toBe(0);
        expect(Number.isNaN((slot.entity as TReading).score)).toBe(true);
    });

    /**
     * A column that genuinely changes must still move, including out of `NaN` and
     * into it. The rule is `===` at every value but one, and a test that only
     * pinned the silence would pass on a predicate that answers true to
     * everything.
     */
    it('still reports the column when the value really does move', () => {
        const { db, effectService, readingsService, readings, updateReading } = createFixture();

        readingsService.slotContentService.upsertEntity(readings,{ id: 'r1', score: 1, label: 'x' });
        db.flush();
        const slot = readingsService.getSlotByKey(readings, 'r1');

        let columnWoke = 0;
        effectService.createEffect(db, [readingsService.holdColumn(slot, 'score')], [], () => { columnWoke++; });

        updateReading('r1',{ score: 2 });
        db.flush();
        expect(columnWoke).toBe(1);

        // Into NaN: a real move, from a number to something that is not one.
        updateReading('r1',{ score: Number('nope') });
        db.flush();
        expect(columnWoke).toBe(2);

        // And out of it again.
        updateReading('r1',{ score: 3 });
        db.flush();
        expect(columnWoke).toBe(3);
    });

    /**
     * The two halves of the engine, asked about ONE value.
     *
     * The STORE's answer — a `Map`, which is SameValueZero by specification —
     * was already "this bucket is still addressed by the same thing". The write
     * path said the column changed, and drove a reindex to find that out. Both
     * assertions are here in one case because the finding is the disagreement,
     * not either half of it: the store's line was green before and is what the
     * displaced report is being held against.
     *
     * With no reindex left to carry the disagreement, the agreement is cheaper
     * to break and no less required — a caller re-keying an entity on every poll
     * would mint at the same key and evict at a different one — so both rules
     * are asked side by side rather than through a mechanism that would have
     * shouted.
     */
    it('gives the write path the answer the key store already gave', () => {
        const { db, effectService, readingsService, readings, updateReading } = createFixture();
        const byScoreService = createOIMBucketService<
            TOIMEntitySlot<TReading>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TReading>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TReading>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TReading>>() });
        const byScore = byScoreService.createStoreSlot(db);

        readingsService.slotContentService.upsertEntity(readings,{ id: 'r1', score: Number.NaN, label: 'x' });
        db.flush();
        const slot = readingsService.getSlotByKey(readings, 'r1');
        // Keyed by the value the entity carries, which is the caller's act now.
        const heldSlot = byScoreService.holdSlotByKey(byScore, Number.NaN);
        byScoreService.slotContentService.writeBucketMemberSlots(heldSlot, [slot]);

        // The store's rule, asked of the container that keeps it and of the
        // function that states it.
        expect(byScoreService.getSlotByKey(byScore, Number.NaN)).toBe(heldSlot);
        expect(oimSameValueZeroGuard(Number.NaN, Number.NaN)).toBe(true);

        let columnWoke = 0;
        effectService.createEffect(db, [readingsService.holdColumn(slot, 'score')], [], () => { columnWoke++; });

        updateReading('r1',{ score: Number.NaN });
        db.flush();

        // And now the write's rule says the same thing about the same value.
        expect(columnWoke).toBe(0);
        // One bucket, because asking for that key again is asking for the
        // same one: a second `NaN` bucket is what two stores disagreeing about
        // one address would look like.
        const againSlot = byScoreService.holdSlotByKey(byScore, Number.NaN);
        expect(againSlot).toBe(heldSlot);
        expect(byScoreService.getSlotCount(byScore)).toBe(1);

        againSlot.owner.unholdSlot(againSlot);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    /**
     * The replacing half, where the same disagreement costs an allocation and a
     * new reference rather than only a wake — which is the entire contract that
     * strategy exists to keep. A reader holding the previous entity to diff
     * against saw a different object on every re-send of an entity that never
     * changed.
     */
    it('does not allocate a new entity when a NaN entity is re-sent under createOIMEntityWriterReplacing', () => {
        const { db, readingsService, readings, updateReading } = createFixture(createOIMEntityWriterReplacing());

        readingsService.slotContentService.upsertEntity(readings,{ id: 'r1', score: Number('not a number'), label: 'x' });
        db.flush();
        const slot = readingsService.getSlotByKey(readings, 'r1');
        const first = slot.entity;

        updateReading('r1',{ score: Number('nor is this') });
        db.flush();
        updateReading('r1',{ score: Number.NaN });
        db.flush();

        expect(slot.entity).toBe(first);

        // And a real move still allocates: this strategy's promise is a new
        // reference per CHANGED entity, and half of that promise is the
        // "changed".
        updateReading('r1',{ score: 7 });
        db.flush();
        expect(slot.entity).not.toBe(first);
    });

    /**
     * The graph's own gate, which is the third copy of the rule and the one
     * whose cost compounds: a derivation holding `NaN` claimed a change on every
     * recomputation, so every node below it derived again and every reader woke,
     * in every frame any source moved, while the value never changed.
     *
     * The source here moves for real — the label goes from one string to
     * another — so the derivation genuinely recomputes. What must not happen is
     * the report.
     *
     * A DERIVATION IS ASKED, NOT WOKEN, so the level below is a second
     * computed with an effect over it rather than a subscription onto the
     * first. `db.computed(...).onChange(h)` is `effectService.createEffect(db, [], [computed], h)`
     * — the effect registers in the derivation's transitive ROOTS and hears
     * about a move through the `sameValueGuard` that is under test here.
     */
    it('does not report a computed as changed when it recomputes to NaN again', () => {
        const { db, effectService, readingsService, readings, updateReading } = createFixture();

        const slot = readingsService.holdSlotByKey(readings, 'r1');

        let runs = 0;
        const scoreService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
            sameValueGuard: oimSameValueZeroGuard,
        });
        const scoreCollectionService = scoreService.computedCollectionService;
        const score = scoreService.createComputedStoreSlot(
            db,
            () => { runs++; return Number(slot.entity?.label); },
            () => ({ sourceSlots: [slot], sourceComputeds: [] }),
        );
        const scoreValue = (): number => {
            const scoreSlot = scoreCollectionService.getSlotByKey(score, undefined);
            return scoreSlot.computedValueService.getValueForSlot(scoreSlot);
        };
        const belowRuns: number[] = [];
        const belowService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
            sameValueGuard: oimSameValueZeroGuard,
        });
        const below = belowService.createComputedStoreSlot(
            db,
            () => { belowRuns.push(scoreValue()); return 0; },
            () => ({ sourceSlots: [], sourceComputeds: [scoreCollectionService.getSlotByKey(score, undefined)] }),
        );

        let runCount = 0;
        const reader = effectService.createEffect(db, [], [scoreCollectionService.getSlotByKey(score, undefined)], () => { runCount++; });
        const readerBelow = effectService.createEffect(db, [], [belowService.computedCollectionService.getSlotByKey(below, undefined)], () => { /* keeps the lower level asked */ });
        readingsService.slotContentService.upsertEntity(readings,{ id: 'r1', score: 1, label: 'x' });
        db.flush();
        expect(Number.isNaN(scoreValue())).toBe(true);
        runs = 0;
        belowRuns.length = 0;
        runCount = 0;

        updateReading('r1',{ label: 'y' });
        db.flush();
        updateReading('r1',{ label: 'z' });
        db.flush();

        // It really did recompute, twice, and reported neither. `runs` is 2 and not
        // 4: the second reader's settle finds the derivation already at the clock.
        expect(runs).toBe(2);
        expect(runCount).toBe(0);
        expect(belowRuns).toEqual([]);
        expect(Number.isNaN(scoreValue())).toBe(true);

        // A value that moves is still reported, so the gate is a gate.
        updateReading('r1',{ label: '5' });
        db.flush();
        expect(runCount).toBe(1);
        expect(scoreValue()).toBe(5);
        expect(belowRuns).toEqual([5]);

        effectService.disposeEffect(reader);
        effectService.disposeEffect(readerBelow);
        slot.owner.unholdSlot(slot);
    });

    /**
     * THE GUARD. `Object.is` is what somebody reaches for on hearing "NaN should
     * be equal to itself", and the specification calls it SameValue, one word
     * away from the rule that is actually wanted. It separates `-0` from `0`, so
     * swapping it in writes, reports and wakes on a column set from `0` to `-0`
     * — the same silent defect this file closes, moved to a value nobody types
     * either. `oimSameValueZeroGuard` refuses `Object.is` at the same value for the same
     * reason.
     */
    it('does not report a column moved from 0 to -0, which is what Object.is would do', () => {
        const { db, effectService, readingsService, readings, updateReading } = createFixture();

        readingsService.slotContentService.upsertEntity(readings,{ id: 'r1', score: 0, label: 'x' });
        db.flush();
        const slot = readingsService.getSlotByKey(readings, 'r1');

        let columnWoke = 0;
        effectService.createEffect(db, [readingsService.holdColumn(slot, 'score')], [], () => { columnWoke++; });

        updateReading('r1',{ score: -0 });
        db.flush();

        expect(columnWoke).toBe(0);
    });
});

/**
 * ONE RULE, CHECKED AGAINST THE CONTAINER.
 *
 * `oimSameValueZeroGuard` answers "the same key" and "the same column value" alike,
 * asserted here against a `Map`, which IS SameValueZero by specification with
 * nothing restated.
 *
 * The two negative assertions are what make this more than decoration: `===`
 * disagrees with the `Map` at `NaN`, `Object.is` disagrees at `-0`, and anyone
 * who "simplifies" `oimSameValueZeroGuard` to either fails here with the value named.
 */
describe('the same value, and what a Map would say', () => {
    /** The oracle: a one-entry `Map` filed under `a` and asked about `b`. */
    const mapSays = (a: unknown, b: unknown): boolean => new Map([[a, 1]]).has(b);

    const anObject = { of: 'a column may hold anything' };
    const anotherObject = { of: 'a column may hold anything' };
    const values: unknown[] = [
        Number.NaN, 0, -0, 1, -1, Number.POSITIVE_INFINITY,
        '', 'a', 'b', '0',
        true, false, null, undefined,
        anObject, anotherObject,
    ];

    it('agrees with a Map at every pair a column could carry', () => {
        for (const a of values) {
            for (const b of values) {
                expect([a, b, oimSameValueZeroGuard(a, b)]).toEqual([a, b, mapSays(a, b)]);
            }
        }
    });

    it('is not === , which parts company at NaN', () => {
        // The rejected rule, written as a rule rather than inline.
        const strictEquality = (a: unknown, b: unknown): boolean => a === b;
        expect(oimSameValueZeroGuard(Number.NaN, Number.NaN)).toBe(true);
        expect(strictEquality(Number.NaN, Number.NaN)).toBe(false);
        expect(mapSays(Number.NaN, Number.NaN)).toBe(true);
    });

    it('is not Object.is, which parts company at -0', () => {
        expect(oimSameValueZeroGuard(0, -0)).toBe(true);
        expect(Object.is(0, -0)).toBe(false);
        expect(mapSays(0, -0)).toBe(true);
    });
});
