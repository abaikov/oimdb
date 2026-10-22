/**
 * A SERVER RE-SENDS THE PAGE IT ALREADY SENT, and nothing happens.
 *
 * ─── A REPEAT IS NOT ONE PLACE IN THE BUCKET ──────────────────────────────
 *
 * "The same slot named twice takes ONE place" is false of the base ordered
 * service: its `add` pushes every mention, so a list naming a slot twice records
 * two places, holds the slot twice, and comes back from `read` verbatim.
 * The whole of the repeat behaviour, across all three services, is pinned in
 * eight cases by
 * `tests/what-a-list-that-names-a-slot-twice-leaves-behind.test.ts`; what is
 * here is this file's own subject, the WAKE-UP.
 */
import {
    OIMDB,
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotContentBucketServiceSetDriven,
    OIMBucketArrayMembershipUnique,
    OIMEffectService,
    createOIMBucketService,
    createOIMEntityService,
} from '../src/index';
import type {
    OIMSlotContentBucketService, TOIMEntitySlot,
    TOIMBucketSlotsArrayStore, TOIMBucketSlotsArrayUniqueStore, TOIMBucketSlotsSetStore,
} from '../src/index';

type TRow = { id: string; rank: number; label: string };
type TRowSlot = TOIMEntitySlot<TRow, string>;

/** The rows, and the three ids a caller would send in the order the server did. */
const ROWS: readonly TRow[] = [
    { id: 'k1', rank: 3, label: 'a' },
    { id: 'k2', rank: 2, label: 'b' },
    { id: 'k3', rank: 1, label: 'c' },
];
const SENT = ['k1', 'k2', 'k3'];

/**
 * A channel, a collection wired to report into it, and one bucket of a bucket
 * collection built over the service under test.
 *
 * The bucket is HELD and the hold is never given back, which is what makes it
 * the same bucket for the length of a case: `writeBucketMemberSlots(bucket, [])` asks the
 * bucket's owner to let it go, and a hold is the answer to that question.
 */
const createFixtureOver = <TSlots>(slotContentService: OIMSlotContentBucketService<TRowSlot, TSlots>) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow, 'id' | 'rank' | 'label', string>(db, { keyOf: row => row.id });
    const rows = rowsService.createStoreSlot(db);
    const bucketService = createOIMBucketService<
        TRowSlot, string, TSlots, OIMSlotContentBucketService<TRowSlot, TSlots>
    >(db, { slotContentService });
    const buckets = bucketService.createStoreSlot(db);
    rowsService.slotContentService.upsertEntities(rows, ROWS.map(row => ({ ...row })));
    db.flush();
    const bucket = bucketService.holdSlotByKey(buckets, 'q0');
    const slotOf = (id: string): TRowSlot => rowsService.getSlotByKey(rows, id);
    const send = (ids: readonly string[]): void => {
        bucketService.slotContentService.writeBucketMemberSlots(bucket, ids.map(slotOf));
        db.flush();
    };
    const ids = (): string[] =>
        Array.from(bucketService.slotContentService.getBucketMemberSlots(bucket)).map(slot => (slot.entity as TRow).id);
    return { db, effectService, rowsService, rows, bucketService, buckets, bucket, send, ids, slotOf };
};

const createFixture = <TSlots extends TOIMBucketSlotsArrayStore<TRowSlot>>(
    service: OIMSlotContentBucketServiceArrayDriven<TRowSlot, TSlots>,
) => createFixtureOver<TSlots>(service);

const createSetFixture = (service: OIMSlotContentBucketServiceSetDriven<TRowSlot>) =>
    createFixtureOver<TOIMBucketSlotsSetStore<TRowSlot>>(service);

describe('a list of slots re-sent in the order the caller sent it', () => {
    it('leaves every slot where it already was, with the references it already had', () => {
        const { rowsService, rows, bucket, bucketService, send } = createFixture(new OIMSlotContentBucketServiceArrayDriven<TRowSlot>());
        send(SENT);
        send(SENT);

        // Read from the BUCKET's side. A row records only how many references it
        // has, so "is it in this one" is a question for the bucket, and the
        // `holdCount` beside it is what says there is no second place
        // somewhere else that an eviction-and-rejoin left behind.
        const slots = Array.from(bucketService.slotContentService.getBucketMemberSlots(bucket));
        for (const id of SENT) {
            const slot = rowsService.getSlotByKey(rows, id);
            expect({ id, filedHere: slots.includes(slot), holds: slot.holdCount })
                .toEqual({ id, filedHere: true, holds: 1 });
        }
    });

    it('a set holds no order, so the same slots in another order set nothing', () => {
        const { db, effectService, bucket, send, ids } =createSetFixture(new OIMSlotContentBucketServiceSetDriven<TRowSlot>());
        send(SENT);

        let runCount = 0;
        effectService.createEffect(db, [bucket], [], () => { runCount++; });
        send(['k3', 'k1', 'k2']);

        expect(runCount).toBe(0);
        // `writeBucketMemberSlots` returns before `drain` when `containsTheSameSequence` agrees, so
        // the set still iterates in its first insertion order. A rebuild shows here.
        expect(ids()).toEqual(SENT);
    });

    it('a list that really did change still lands and still wakes', () => {
        const { db, effectService, bucket, send, ids } =createFixture(new OIMSlotContentBucketServiceArrayDriven<TRowSlot>());
        send(SENT);

        let runCount = 0;
        effectService.createEffect(db, [bucket], [],() => { runCount++; });
        send(['k1', 'k2']);

        expect(ids()).toEqual(['k1', 'k2']);
        expect(runCount).toBe(1);
    });

    it('a service whose positions the caller places is still reordered by a re-ordered list', () => {
        const { db, effectService, bucket, send, ids } =createFixture(new OIMSlotContentBucketServiceArrayDriven<TRowSlot>());
        send(SENT);
        expect(ids()).toEqual(SENT);

        let runCount = 0;
        effectService.createEffect(db, [bucket], [],() => { runCount++; });
        send(['k3', 'k2', 'k1']);

        expect(ids()).toEqual(['k3', 'k2', 'k1']);
        expect(runCount).toBe(1);
    });

    it('and is not woken by the same list in the same order', () => {
        const { db, effectService, bucket, send } =createFixture(new OIMSlotContentBucketServiceArrayDriven<TRowSlot>());
        send(SENT);

        let runCount = 0;
        effectService.createEffect(db, [bucket], [],() => { runCount++; });
        send(SENT);

        expect(runCount).toBe(0);
    });

    /**
     * A REPEAT TAKES A SECOND PLACE IN THE BUCKET ON THIS SERVICE, and the
     * wake-up guard holds over it all the same.
     *
     * `['k1', 'k2', 'k2', 'k3']` does NOT settle to `['k1', 'k2', 'k3']`. That
     * reading rests on the premise that `writeBucketMemberSlots` unlinks each slot before
     * joining it; `writeBucketMemberSlots` does one `drain` and then a join loop, with no
     * per-slot unlink anywhere in it, and this service's `add` pushes every
     * mention — so the bucket holds the caller's list verbatim and `k2` twice.
     * `containsExactly` was written to that same premise and has been repaired
     * against it; see `IOIMBucketArrayMembership.containsTheSameSequence`.
     *
     * This file's subject is that an identical re-send changes nothing and wakes
     * nobody — asked of the list as the service actually records it.
     */
    it('a repeat is recorded as a second place, and re-sending that list wakes nobody', () => {
        const { db, effectService, bucket, send, ids, slotOf } =createFixture(new OIMSlotContentBucketServiceArrayDriven<TRowSlot>());
        send(['k1', 'k2', 'k2', 'k3']);
        expect(ids()).toEqual(['k1', 'k2', 'k2', 'k3']);

        let runCount = 0;
        effectService.createEffect(db, [bucket], [],() => { runCount++; });
        send(['k1', 'k2', 'k2', 'k3']);

        expect(ids()).toEqual(['k1', 'k2', 'k2', 'k3']);
        expect(slotOf('k2').holdCount).toBe(2);
        expect(runCount).toBe(0);
    });

    /**
     * The other direction, so that the repair cannot be read as "a list with a
     * repeat in it changes nothing": naming a slot again at the END is a fourth
     * place, and that is a change the caller is owed. Every mention is
     * recorded, so the caller's list arrives whole and `k1` is held twice.
     */
    it('a repeat that really does add a mention still lands and still wakes', () => {
        const { db, effectService, bucket, send, ids, slotOf } =createFixture(new OIMSlotContentBucketServiceArrayDriven<TRowSlot>());
        send(SENT);
        expect(ids()).toEqual(SENT);

        let runCount = 0;
        effectService.createEffect(db, [bucket], [],() => { runCount++; });
        send(['k1', 'k2', 'k3', 'k1']);

        expect(ids()).toEqual(['k1', 'k2', 'k3', 'k1']);
        expect(slotOf('k1').holdCount).toBe(2);
        expect(runCount).toBe(1);
    });

    /**
     * The deduplicating bucket is the arm that REFUSES the second mention,
     * and first-occurrence-wins, because that is the mention `add` let
     * through.
     */
    it('the deduplicating bucket records a repeat once, and is not woken by it re-sent', () => {
        const { db, effectService, bucket, send, ids, slotOf } =
            createFixture(new OIMSlotContentBucketServiceArrayDriven<TRowSlot, TOIMBucketSlotsArrayUniqueStore<TRowSlot>>({
                bucketArrayMembership: new OIMBucketArrayMembershipUnique<TRowSlot>(),
            }));
        send(['k1', 'k2', 'k2']);
        expect(ids()).toEqual(['k1', 'k2']);
        expect(slotOf('k2').holdCount).toBe(1);

        let runCount = 0;
        effectService.createEffect(db, [bucket], [],() => { runCount++; });
        send(['k1', 'k2', 'k2']);

        expect(runCount).toBe(0);
    });
});
