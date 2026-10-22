import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMEffectService } from '../OIMEffectService';
import type { TOIMEffect } from '../types/TOIMEffect';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TRow = { id: string; title: string; n: number };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

function createFixture() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });
    const rows = rowsService.createStoreSlot(db);
    const updateRow = (key: string, patch: Partial<TRow>): void => {
        const rowSlot = rowsService.findSlotByKey(rows, key);
        if (rowSlot !== undefined) rowsService.slotContentService.updateEntity(rowSlot, patch);
    };
    return { db, effectService, rowsService, rows, updateRow };
}

/** The slot of a key this file has already written. */
const slotOf = (
    rowsService: ReturnType<typeof createFixture>['rowsService'],
    rows: ReturnType<typeof createFixture>['rows'],
    id: string,
): TRowSlot => rowsService.getSlotByKey(rows, id);

describe('when an effect is called and when it is not', () => {
    it('an effect is coalesced, one call per frame however many writes landed', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let calls = 0;
        effectService.createEffect(db, [slot], [], () => { calls++; });
        for (let i = 1; i <= 5; i++) updateRow('r1', { n: i });
        db.flush();
        expect(calls).toBe(1);
    });

    it('an effect is not called when nothing moved', () => {
        const { db, effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let calls = 0;
        effectService.createEffect(db, [slot], [], () => { calls++; });
        db.flush();
        expect(calls).toBe(0);
    });

    it('a column effect wakes only when that named column moved', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let titleWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { titleWoke++; });
        updateRow('r1', { title: 'b' });
        db.flush();
        expect(titleWoke).toBe(1);
    });

    it('a column effect is not woken by another column\'s write', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let titleWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { titleWoke++; });
        updateRow('r1', { n: 5 });
        db.flush();
        expect(titleWoke).toBe(0);
    });

    it('the whole-slot effect still wakes for both columns', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let wholeWoke = 0;
        effectService.createEffect(db, [slot], [], () => { wholeWoke++; });
        updateRow('r1', { title: 'b' });
        db.flush();
        updateRow('r1', { n: 5 });
        db.flush();
        expect(wholeWoke).toBe(2);
    });

    it('a column effect wakes when a slot is written whole — all its columns count as moved', () => {
        const { db, effectService, rowsService, rows } = createFixture();
        // A READ NEVER MINTS, so the identity of a key with no value is taken
        // through the door that does: `hold`.
        const heldSlot = rowsService.holdSlotByKey(rows, 'r1');
        let titleWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(heldSlot, 'title')], [], () => { titleWoke++; });
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        expect(titleWoke).toBe(1);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('a column effect wakes when a slot is removed — all its columns count as moved', () => {
        const { db, effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let titleWoke = 0;
        // Keep the identity across the removal so we can still observe it: an
        // effect on the slot is a reference, and the value is not the only thing
        // that keeps a slot filed.
        const keep = effectService.createEffect(db, [slot], [], () => { /* held */ });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { titleWoke++; });
        rowsService.slotContentService.deleteEntity(slot);
        db.flush();
        expect(titleWoke).toBe(1);
        effectService.disposeEffect(keep);
    });

    it('detach stops an effect', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let calls = 0;
        const effect = effectService.createEffect(db, [slot], [], () => { calls++; });
        effectService.disposeEffect(effect);
        updateRow('r1', { n: 1 });
        db.flush();
        expect(calls).toBe(0);
    });

    it('detach stops a column effect', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let calls = 0;
        const effect = effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { calls++; });
        effectService.disposeEffect(effect);
        updateRow('r1', { title: 'zzz' });
        db.flush();
        expect(calls).toBe(0);
    });

    it('detaching twice is harmless, for both kinds of effect', () => {
        const { db, effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        // `dispose` splices by identity and skips a list it is not in, and the
        // second call arrives at an owner holding an identity that has already
        // been given back — which is declined rather than acted on.
        const onSlot = effectService.createEffect(db, [slot], [], () => { /* nothing */ });
        const onColumn = effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { /* nothing */ });
        expect(() => {
            effectService.disposeEffect(onSlot); effectService.disposeEffect(onSlot);
            effectService.disposeEffect(onColumn); effectService.disposeEffect(onColumn);
        }).not.toThrow();
    });

    it('an effect built from inside a body is not run in that same frame', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let lateRan = 0;
        const born: { effect?: TOIMEffect } = {};
        effectService.createEffect(db, [slot], [], () => {
            if (born.effect !== undefined) return;
            born.effect = effectService.createEffect(db, [slot], [], () => { lateRan++; });
        });
        updateRow('r1', { n: 1 });
        db.flush();
        expect(lateRan).toBe(0);

        updateRow('r1', { n: 2 });
        db.flush();
        expect(lateRan).toBe(1);
    });

    it('a body that swaps a stale binding for a fresh one does not get the fresh one called in that frame', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let freshRan = 0;
        // A holder rather than a `let`, so the binding the body reads is written
        // once and the reference is a field read at the moment it runs.
        const stale: { effect?: TOIMEffect } = {};
        let swapped = false;
        // What an adapter does when a component re-binds: drop the binding that
        // has gone stale and put the new one in its place.
        effectService.createEffect(db, [slot], [], () => {
            if (swapped) return;
            swapped = true;
            if (stale.effect) effectService.disposeEffect(stale.effect);
            effectService.createEffect(db, [slot], [], () => { freshRan++; });
        });
        stale.effect = effectService.createEffect(db, [slot], [], () => { /* the stale binding */ });

        updateRow('r1', { n: 1 });
        db.flush();
        expect(freshRan).toBe(0);

        updateRow('r1', { n: 2 });
        db.flush();
        expect(freshRan).toBe(1);
    });

    it('an effect built before a batch of two writes is told once, and not again on the empty frame after', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let runCount = 0;
        effectService.createEffect(db, [slot], [], () => { runCount++; });
        updateRow('r1', { n: 1 });
        updateRow('r1', { n: 2 });
        db.flush();
        expect(runCount).toBe(1);

        db.flush();
        expect(runCount).toBe(1);
    });

    it('a column effect built after a write in the same batch is not told about that write, only about the next one', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        // Something already reads the whole slot, which is the ordinary state of
        // a slot that is on screen.
        let wholeWoke = 0;
        effectService.createEffect(db, [slot], [], () => { wholeWoke++; });

        updateRow('r1', { title: 'b' });
        // Subscribed after the write and before the flush: the timing of a
        // reader subscribing in response to the render that write caused.
        let titleWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { titleWoke++; });
        db.flush();

        expect(wholeWoke).toBe(1);
        expect(titleWoke).toBe(0);

        updateRow('r1', { title: 'c' });
        db.flush();
        expect(titleWoke).toBe(1);
    });

    it('the same for one effect over several columns at once: nothing from the batch it was built behind', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        updateRow('r1', { title: 'b' });
        let runCount = 0;
        effectService.createEffect(
            db,
            (['title', 'n'] as const).map((name) => rowsService.getColumn(slot, name)),
            [],
            () => { runCount++; },
        );
        db.flush();
        expect(runCount).toBe(0);

        updateRow('r1', { n: 5 });
        db.flush();
        expect(runCount).toBe(1);
    });

    it('that late column effect is told nothing whichever column moved, and is exact from the next frame', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        updateRow('r1', { n: 5 });
        let titleWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(slot, 'title')], [], () => { titleWoke++; });
        db.flush();
        expect(titleWoke).toBe(0);

        updateRow('r1', { n: 6 });
        db.flush();
        expect(titleWoke).toBe(0);

        updateRow('r1', { title: 'b' });
        db.flush();
        expect(titleWoke).toBe(1);
    });

    it('an effect detached by an earlier effect in the same frame is skipped', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows,'r1');
        let victimRan = 0;
        const victim: { effect?: TOIMEffect } = {};
        // The detacher is registered first, so it is listed first: `write` walks
        // `slot.effects` in order.
        effectService.createEffect(db, [slot], [], () => { if (victim.effect) effectService.disposeEffect(victim.effect); });
        victim.effect = effectService.createEffect(db, [slot], [], () => { victimRan++; });
        updateRow('r1', { n: 1 });
        db.flush();
        // `dispose` writes -1 over the stamp and the frame's pass checks it again
        // before calling.
        expect(victimRan).toBe(0);
    });

    /**
     * ONE MECHANISM, WHATEVER KIND OF IDENTITY MOVED.
     *
     * There is no injectable subscriber store and no option that changes what a
     * subscription IS — `TOIMChannelOptions` offers `channelScheduler`, `errorPolicy` and
     * `onBeforeFlush` — because a subscription is an effect in the identity's own
     * list of dependents, and telling one is putting it on the frame's array.
     *
     * So the claim is asserted the way an adapter would see it: a SLOT and a
     * BUCKET are woken by the same machinery, in one frame, and "how many are
     * listening" is answered for both off the same field — which is what decides
     * whether an identity may be let go.
     *
     * Nothing derives a bucket's slots, so the second event here is the caller
     * emptying the bucket, which is what moving a slot out of a response is.
     */
    it('wakes a slot and a bucket alike, and answers for both from one list', () => {
        const { db, effectService, rowsService, rows, updateRow } = createFixture();
        const byTitleService = createOIMBucketService<
            TRowSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TRowSlot>, OIMSlotContentBucketServiceSetDriven<TRowSlot>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TRowSlot>() });
        const byTitle = byTitleService.createStoreSlot(db);
        // The shape a screen holds: the bucket at a key, minted through a door
        // that leaves a counted reference behind.
        const acesSlot = byTitleService.holdSlotByKey(byTitle, 'ace');
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'ace', n: 0 });
        byTitleService.slotContentService.writeBucketMemberSlots(acesSlot, [slotOf(rowsService, rows,'r1')]);
        db.flush();

        let rowWoke = 0;
        let bucketWoke = 0;
        effectService.createEffect(db, [slotOf(rowsService, rows,'r1')], [], () => { rowWoke++; });
        effectService.createEffect(db, [acesSlot], [], () => { bucketWoke++; });

        updateRow('r1', { title: 'king' });
        byTitleService.slotContentService.writeBucketMemberSlots(acesSlot, []);
        db.flush();

        expect([rowWoke, bucketWoke]).toEqual([1, 1]);
        expect(slotOf(rowsService, rows,'r1').effects?.length).toBe(1);
        expect(acesSlot.effects?.length).toBe(1);

        acesSlot.owner.unholdSlot(acesSlot);
    });
});
