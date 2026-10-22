import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import type { TOIMBucketSlot } from '../../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../../entity/types/TOIMEntityColumnName';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';

type TRow = { id: string };
type TRowSlot = TOIMEntitySlot<TRow, string>;
type TSlots = TOIMBucketSlotsArrayStore<TRowSlot>;
type TPage = TOIMBucketSlot<TSlots, string>;

/** What one call did to the slots list, element by element. */
type TListTally = {
    indexReads: number;
    indexWrites: number;
    indexDeletes: number;
    lengthWrites: number;
};

const isIndexName = (property: string | symbol): boolean =>
    typeof property === 'string' && /^\d+$/.test(property);

/**
 * The same array, watched. Reads and writes of an index are counted; `length`
 * is counted apart, because "one write of `length`" is precisely the shape the
 * shipped eviction has and counting it with the elements would hide that.
 *
 * `Reflect.get`/`Reflect.set` are called WITHOUT a receiver on purpose: passing
 * the proxy back as the receiver sends an ordinary element write through the
 * `defineProperty` trap instead, which is a different operation and would be
 * counted somewhere else.
 */
const watchedList = (
    list: TRowSlot[], tally: TListTally,
): TRowSlot[] => new Proxy(list, {
    get(target, property) {
        if (isIndexName(property)) tally.indexReads++;
        return Reflect.get(target, property);
    },
    set(target, property, value) {
        if (isIndexName(property)) tally.indexWrites++;
        else if (property === 'length') tally.lengthWrites++;
        return Reflect.set(target, property, value);
    },
    deleteProperty(target, property) {
        if (isIndexName(property)) tally.indexDeletes++;
        return Reflect.deleteProperty(target, property);
    },
});

/** An ordered bucket already holding `size` slots. */
const filledBucket = (size: number) => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, string>(db, { keyOf: row => row.id });
    const rows = rowsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TRowSlot>();
    const indexService = createOIMBucketService<
        TRowSlot, string, TSlots, OIMSlotContentBucketServiceArrayDriven<TRowSlot>
    >(db, { slotContentService: membersService });
    const index = indexService.createStoreSlot(db);

    for (let i = 0; i < size; i++) rowsService.slotContentService.upsertEntity(rows, { id: `r${i}` });

    const slots: TRowSlot[] = [];
    for (let i = 0; i < size; i++) slots.push(rowsService.getSlotByKey(rows, `r${i}`)!);
    // HELD, so that emptying it cannot unfile it under the measurement: the
    // last departure asks the bucket's owner, and a hold is the answer.
    const bucket = indexService.holdSlotByKey(index, 'page');
    membersService.writeBucketMemberSlots(bucket, slots);

    return { rowsService, rows, membersService, indexService, index, bucket, slots };
};

/** Fresh slots for a replacement — `size` rows this bucket has never held. */
const strangers = (
    rowsService: ReturnType<typeof filledBucket>['rowsService'],
    rows: ReturnType<typeof filledBucket>['rows'],
    size: number,
): TRowSlot[] => {
    for (let i = 0; i < size; i++) rowsService.slotContentService.upsertEntity(rows, { id: `s${i}` });
    const slots: TRowSlot[] = [];
    for (let i = 0; i < size; i++) slots.push(rowsService.getSlotByKey(rows, `s${i}`)!);
    return slots;
};

/** Start counting what happens to this bucket's slots list. Once per bucket. */
const watch = (bucket: TPage): TListTally => {
    const tally: TListTally = {
        indexReads: 0, indexWrites: 0, indexDeletes: 0, lengthWrites: 0,
    };
    bucket.bucketSlotsStore.bucketMemberSlots = watchedList(bucket.bucketSlotsStore.bucketMemberSlots, tally);
    return tally;
};

describe('what emptying a bucket costs, element by element', () => {
    /**
     * THE SHIPPED PATH. One `length` write for the whole eviction, whatever the
     * bucket holds — and one read per slot, which is the copy `drain`
     * hands back so that `write` can unlink each of them without walking
     * the bucket's slots a second time.
     *
     * Two sizes, because a single size cannot tell "one write" from "a number
     * that happened to be small".
     */
    it.each([500, 1000])('empties a bucket of %i without writing one element', size => {
        const { membersService, bucket } = filledBucket(size);
        const tally = watch(bucket);

        membersService.writeBucketMemberSlots(bucket, []);

        expect(tally.indexWrites).toBe(0);
        expect(tally.indexDeletes).toBe(0);
        expect(tally.lengthWrites).toBe(1);
        expect(tally.indexReads).toBe(size);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(0);
    });

    /**
     * AND THE DESIGN THAT WAS REPLACED, run rather than remembered: the same
     * slots out of the same bucket through the same service, one at a time.
     *
     * 499 500 is 1000·999/2 — the "half a million" of the claim, to the digit,
     * in element writes rather than the map writes the comment names. Each
     * `remove` finds its slot at the front in one comparison and then `splice`
     * shifts every slot behind it down one place.
     */
    it('takes the same thousand out one at a time for 499 500 element writes', () => {
        const size = 1000;
        const { membersService, bucket, slots } = filledBucket(size);
        const tally = watch(bucket);

        // Front first — the order a loop over the bucket's slots walks them in.
        for (let i = 0; i < slots.length; i++) membersService.removeBucketMemberSlot(bucket, slots[i]);

        expect(tally.indexWrites).toBe((size * (size - 1)) / 2);
        expect(tally.indexWrites).toBe(499500);
        // One splice per slot, each of them dropping the duplicate its shift
        // left at the end — where the shipped eviction truncates in one write of
        // `length` and deletes nothing element by element.
        expect(tally.indexDeletes).toBe(size);
    });

    /**
     * The other end, because it is the repair anybody would reach for first and
     * it is not one. Taking the LAST slot out shifts nothing — and `remove`
     * has to find it, which is a scan of the whole list, so the quadratic moves
     * from the writes into the reads: 1000 + 999 + … + 1 = 500 500 comparisons
     * before a single element is touched.
     */
    it('and takes them out from the back for 500 500 element reads instead', () => {
        const size = 1000;
        const { membersService, bucket, slots } = filledBucket(size);
        const tally = watch(bucket);

        for (let i = slots.length - 1; i >= 0; i--) membersService.removeBucketMemberSlot(bucket, slots[i]);

        expect(tally.indexWrites).toBe(0);
        // The scans alone are n·(n+1)/2; `splice` also reads the element it
        // takes out, so the total is that plus one per removal.
        expect(tally.indexReads).toBeGreaterThanOrEqual((size * (size + 1)) / 2);
        expect(tally.indexReads).toBeLessThan(size * size);
    });

    /**
     * The whole call, not only its eviction half: replacing every slot costs
     * one element write per ARRIVING slot — the push that appends it — and
     * nothing for the thousand that left. Doubling the size doubles the writes,
     * which is the statement "not quadratic" made in the only unit that can
     * carry it.
     */
    it.each([500, 1000])('replaces all %i slots for exactly that many element writes', size => {
        const { rowsService, rows, membersService, bucket } = filledBucket(size);
        const arriving = strangers(rowsService, rows, size);
        const tally = watch(bucket);

        membersService.writeBucketMemberSlots(bucket, arriving);

        expect(tally.indexWrites).toBe(size);
        expect(tally.indexReads).toBeLessThan(3 * size);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(size);
    });
});
