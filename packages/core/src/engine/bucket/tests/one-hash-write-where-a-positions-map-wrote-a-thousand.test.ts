import { OIMDB, OIMSlotContentBucketServiceArrayDriven, createOIMBucketService, createOIMEntityService } from '../../../index';
import { OIMBucketArrayMembershipUnique } from '../array/OIMBucketArrayMembershipUnique';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsArrayUniqueStore } from '../array/types/TOIMBucketSlotsArrayUniqueStore';

type TRow = { id: string };
type TRowSlot = TOIMEntitySlot<TRow, string>;

/**
 * A `Set` that counts what is written into it and what is asked of it.
 *
 * The `Set` constructor calls `add` for every element of the iterable it is
 * given, through the instance — so a counter built from an existing set of slots
 * starts with one write per slot already tallied, and every caller below
 * resets it before measuring anything.
 */
class CountedSet<T> extends Set<T> {
    public writes = 0;
    public reads = 0;

    public override add(value: T): this {
        this.writes++;
        return super.add(value);
    }

    public override delete(value: T): boolean {
        this.writes++;
        return super.delete(value);
    }

    public override clear(): void {
        this.writes++;
        super.clear();
    }

    public override has(value: T): boolean {
        this.reads++;
        return super.has(value);
    }

    public reset(): void {
        this.writes = 0;
        this.reads = 0;
    }
}

/**
 * THE DESIGN THAT WAS REJECTED, as much of it as the claim is about: the same
 * ordered list, with the bucket's slots kept in a `Map` to positions instead of
 * a `Set`.
 *
 * Only the two operations the comment names are modelled — the structural edit
 * and the re-file after a move — because those are what it counts. Everything
 * else about the service is unchanged between the two designs and would be the
 * same code twice.
 */
class PositionsMapSlots {
    public readonly list: TOIMEntitySlot[] = [];
    private readonly positions = new Map<TOIMEntitySlot, number>();
    /** Every `Map.set` this design owes. */
    public hashWrites = 0;

    public insertAt(at: number, slot: TOIMEntitySlot): void {
        this.list.splice(at, 0, slot);
        // Everything from the insertion point on has a new position, including
        // the arriving slot itself. This is the renumber the claim counts.
        for (let i = at; i < this.list.length; i++) {
            this.positions.set(this.list[i], i);
            this.hashWrites++;
        }
    }

    /** A position in one hash — what the map is for, and what it charges for. */
    public getPosition(slot: TOIMEntitySlot): number {
        const at = this.positions.get(slot);
        return at === undefined ? -1 : at;
    }

    /** A move permutes the list, so every position it filed is now wrong. */
    public refileAfterPermutation(): void {
        for (let i = 0; i < this.list.length; i++) {
            this.positions.set(this.list[i], i);
            this.hashWrites++;
        }
    }
}

/** Swap the set the bucket keeps its slots in for a counter over the same slots. */
const watchPresence = <TBucketMemberSlot extends TOIMSlot>(
    bucket: TOIMBucketSlot<TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot>>,
): CountedSet<TBucketMemberSlot> => {
    const counted = new CountedSet<TBucketMemberSlot>(bucket.bucketSlotsStore.uniqueBucketMemberSlots);
    bucket.bucketSlotsStore.uniqueBucketMemberSlots = counted;
    counted.reset();
    return counted;
};

/** No sorter, so the positions are the caller's; a distinct list, so its slots have a hash. */
const handFilledBucket = (size: number) => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService(db, { keyOf: (row: TRow) => row.id });
    const rows = rowsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TRowSlot, TOIMBucketSlotsArrayUniqueStore<TRowSlot>>({
        bucketArrayMembership: new OIMBucketArrayMembershipUnique<TRowSlot>(),
    });
    const indexService = createOIMBucketService<
        TRowSlot, string, TOIMBucketSlotsArrayUniqueStore<TRowSlot>,
        OIMSlotContentBucketServiceArrayDriven<TRowSlot, TOIMBucketSlotsArrayUniqueStore<TRowSlot>>
    >(db, { slotContentService: membersService });
    const index = indexService.createStoreSlot(db);

    for (let i = 0; i < size; i++) rowsService.slotContentService.upsertEntity(rows, { id: `r${i}` });
    rowsService.slotContentService.upsertEntity(rows, { id: 'arriving' });
    db.flush();

    const bucket = indexService.holdSlotByKey(index, 'page');

    for (let i = 0; i < size; i++) {
        membersService.insertBucketMemberSlotAt(bucket, membersService.getBucketMemberSlotCount(bucket), rowsService.getSlotByKey(rows, `r${i}`));
    }
    bucket.owner.unholdSlot(bucket);
    db.flush();

    return { db, rowsService, rows, membersService, bucket, arriving: rowsService.getSlotByKey(rows, 'arriving') };
};

describe('what a prepend writes into a hash', () => {
    it.each([1024, 2048])('prepends into a list of %i for one hash write', size => {
        const { membersService, bucket, arriving } = handFilledBucket(size);
        const present = watchPresence(bucket);

        membersService.insertBucketMemberSlotAt(bucket, 0, arriving);

        expect(present.writes).toBe(1);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(size + 1);
        expect(membersService.getBucketMemberSlotAt(bucket, 0)).toBe(arriving);
        expect(membersService.getBucketMemberSlotPosition(bucket, arriving)).toBe(0);
    });

    /**
     * And the design that was refused, run: the renumber is every position from
     * the insertion point to the end of the list AFTER the insertion, so a
     * prepend into 1 024 is 1 025 map writes.
     *
     * That is the count the alternatives pair timed at 10.78 µs against our
     * 980 ns; it is also where the comment's round figure comes from, and it is
     * one short — a prepend into a list of 1 000 is 1 001 map writes, not 1 000,
     * because the arriving slot is filed too.
     */
    it.each<[number, number]>([
        [1000, 1001],
        [1024, 1025],
        [2048, 2049],
    ])('a positions map owes %i slots a renumber of %i map writes', (size, expected) => {
        const model = new PositionsMapSlots();
        const slots: TOIMEntitySlot[] = [];
        for (let i = 0; i < size; i++) slots.push({ key: `r${i}` } as unknown as TOIMEntitySlot);
        for (let i = 0; i < size; i++) model.insertAt(model.list.length, slots[i]);

        model.hashWrites = 0;
        const arriving = { key: 'arriving' } as unknown as TOIMEntitySlot;
        model.insertAt(0, arriving);

        expect(model.hashWrites).toBe(expected);
        // The thing those writes bought, so the model is not a straw man: a
        // position in one hash, which is what the shipped design gave up.
        expect(model.getPosition(arriving)).toBe(0);
        expect(model.getPosition(slots[size - 1])).toBe(size);
    });

    it('a move that reorders a thousand slots costs the shipped design no hash write', () => {
        const size = 1024;
        const { db, rowsService, rows, membersService, bucket } = handFilledBucket(size);
        const present = watchPresence(bucket);

        membersService.moveBucketMemberSlotToPosition(bucket, 500, 0);
        db.flush();

        expect(membersService.getBucketMemberSlotAt(bucket, 0)).toBe(rowsService.getSlotByKey(rows, 'r500'));
        expect(membersService.getBucketMemberSlotAt(bucket, 1)).toBe(rowsService.getSlotByKey(rows, 'r0'));
        expect(present.writes).toBe(0);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(size);

        const model = new PositionsMapSlots();
        for (let i = 0; i < size; i++) {
            model.insertAt(model.list.length, { key: `r${i}` } as unknown as TOIMEntitySlot);
        }
        model.hashWrites = 0;
        model.refileAfterPermutation();

        expect(model.hashWrites).toBe(size);
    });
});
