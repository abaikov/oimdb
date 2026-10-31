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
import { OIMDB, OIMPositionalArrayBucketContentService, OIMSetBucketContentService, OIMEffectService } from '../src/index';
import type { OIMBucketContentService, TOIMEntitySlot, TOIMBucketSlotsArrayStore, TOIMBucketSlotsSetStore } from '../src/index';
import { createOIMEntityContentService } from '../src/index';
import { createOIMSlotCollectionService } from '../src/index';

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
 * the same bucket for the length of a case: `writeSlotContent(bucket, [])` asks the
 * bucket's owner to let it go, and a hold is the answer to that question.
 */
const createFixtureOver = <TSlots>(slotContentService: OIMBucketContentService<TRowSlot, TSlots>) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TRow, string>() });
    const rows = rowsService.createStoreSlot(db);
    const bucketService = createOIMSlotCollectionService({ slotContentService });
    const buckets = bucketService.createStoreSlot(db);
    rowsService.writeInBatch(rows, () => (ROWS.map(row => ({ ...row }))).map(entity => rowsService.writeSlotContentByKey(rows, entity.id, entity)));
    db.flush();
    const bucket = bucketService.holdSlotByKey(buckets, 'q0');
    const slotOf = (id: string): TRowSlot => rowsService.getSlotByKey(rows, id);
    const send = (ids: readonly string[]): void => {
        bucketService.slotContentService.writeSlotContent(bucket, ids.map(slotOf));
        db.flush();
    };
    const ids = (): string[] =>
        Array.from(bucketService.slotContentService.getBucketMemberSlots(bucket)).map(slot => (slot.entity as TRow).id);
    return { db, effectService, rowsService, rows, bucketService, buckets, bucket, send, ids, slotOf };
};

const createFixture = (
    service: OIMPositionalArrayBucketContentService<TRowSlot>,
) => createFixtureOver<TOIMBucketSlotsArrayStore<TRowSlot>>(service);

const createSetFixture = (service: OIMSetBucketContentService<TRowSlot>) =>
    createFixtureOver<TOIMBucketSlotsSetStore<TRowSlot>>(service);

describe('a list of slots re-sent in the order the caller sent it', () => {

    it('a set holds no order, so the same slots in another order set nothing', () => {
        const { db, effectService, bucket, send, ids } =createSetFixture(new OIMSetBucketContentService<TRowSlot>());
        send(SENT);

        let runCount = 0;
        effectService.createEffect(db, () => { runCount++; }, [bucket]);
        send(['k3', 'k1', 'k2']);

        expect(runCount).toBe(0);
        // `writeBucketMemberSlots` returns before `drain` when `containsTheSameSequence` agrees, so
        // the set still iterates in its first insertion order. A rebuild shows here.
        expect(ids()).toEqual(SENT);
    });

    it('a list that really did change still lands and still wakes', () => {
        const { db, effectService, bucket, send, ids } =createFixture(new OIMPositionalArrayBucketContentService<TRowSlot>());
        send(SENT);

        let runCount = 0;
        effectService.createEffect(db, () => { runCount++; }, [bucket]);
        send(['k1', 'k2']);

        expect(ids()).toEqual(['k1', 'k2']);
        expect(runCount).toBe(1);
    });
});
