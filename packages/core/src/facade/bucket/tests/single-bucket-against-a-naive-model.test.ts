import {
    OIMDB,
    OIMEffectService,
    createOIMEntityService,
    createOIMSingleBucketService,
    oimIsSlotReleased,
} from '../../../index';
import type {
    TOIMBucketSlot,
    TOIMEntityColumnName,
    TOIMEntitySlot,
} from '../../../index';
import { assertConsistent, entitiesUnderTest } from '../../../../tests/support/assertConsistent';
import type { TBucketsUnderTest } from '../../../../tests/support/assertConsistent';

type TRow = { id: string; rank: number; label: string };
type TRowSlot = TOIMEntitySlot<TRow, string>;
type TSingleBucketService = ReturnType<typeof createOIMSingleBucketService<TRowSlot>>;
type TSingleBucket = ReturnType<TSingleBucketService['createStoreSlot']>;

const KEYS = 10;

const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, string>(db, { keyOf: (row) => row.id });
    const rows = rowsService.createStoreSlot(db);
    // No sorter: the caller places the slots, so their order is part of
    // what the bucket holds and the model is simply the last list sent.
    const singleService: TSingleBucketService = createOIMSingleBucketService<TRowSlot>(db);
    const single = singleService.createStoreSlot(db);
    return { db, effectService, rowsService, rows, singleService, single };
};

/**
 * What a bucket nothing filed must keep saying about itself, whatever has been
 * done to it.
 *
 * `assertConsistent` can only walk the buckets a collection FILED, and this one
 * is filed nowhere — so the helper would walk an empty list and this file's one
 * bucket would go unchecked. It is handed over as a collection of one instead,
 * which is what it is.
 */
const asCollectionOfOne = (singleService: TSingleBucketService, single: TSingleBucket): TBucketsUnderTest => ({
    bucketSlots: [singleService.getSingleSlot(single)],
    getBucketSlotByKey: (): TOIMBucketSlot => {
            throw new Error(
                'a bucket under no key is looked up by nothing, and `assertConsistent` skips the '
                + 'lookup for a bucket whose key is undefined — which is precisely this one.',
            );
        },
    getBucketMemberSlots: (): Iterable<TOIMEntitySlot> => singleService.slotContentService.getBucketMemberSlots(singleService.getSingleSlot(single)),
    getBucketMemberSlotCount: (): number => singleService.slotContentService.getBucketMemberSlotCount(singleService.getSingleSlot(single)),
});

/** The permanence while an effect reads it, asked directly: never released, still the one the service reads, and owned by the single itself. */
const assertPermanentBucket = (
    singleService: TSingleBucketService, single: TSingleBucket, watchedSingleSlot: TOIMBucketSlot, where: string,
): void => {
    if (oimIsSlotReleased(watchedSingleSlot) || singleService.getSingleSlot(single) !== watchedSingleSlot) {
        throw new Error(
            `${where}: the single bucket was released, and whoever holds it would then be ` +
            'subscribed to a bucket nothing writes to any more.',
        );
    }
    if (singleService.getSingleSlot(single).owner !== Reflect.get(singleService, 'slotOwnerService')) {
        throw new Error(
            `${where}: the bucket slot is owned by something other than the single bucket, so a hold ` +
            'or a release on it would reach an owner that does not keep it.',
        );
    }
};

const run = (seed: number, steps: number): void => {
    const random = makeRandom(seed);
    const { db, effectService, rowsService, rows, singleService, single } = createFixture();
    const rowsContentService = rowsService.slotContentService;
    const singleContentService = singleService.slotContentService;
    const watchedSingleSlot = singleService.getSingleSlot(single);

    /** The oracle: every row the script believes exists. */
    const model = new Map<string, TRow>();
    /** And the hand-filled list, which is simply whatever the script last set. */
    let handModel: string[] = [];
    const send = (): void => {
        singleContentService.writeBucketMemberSlots(singleService.getSingleSlot(single), handModel.map((key) => rowsService.getSlotByKey(rows, key)));
    };

    let wokeHand = 0;
    effectService.createEffect(db, [watchedSingleSlot], [], () => { wokeHand++; });

    const engineView = (): string[] =>
        Array.from(singleContentService.getBucketMemberSlots(singleService.getSingleSlot(single))).map((slot) => (slot.entity as TRow).id);

    let shownHand: string[] = [];

    for (let step = 0; step < steps; step++) {
        wokeHand = 0;

        const id = `k${Math.floor(random() * KEYS)}`;
        const has = model.get(id);
        const choice = random();
        /**
         * The upper bound on who may be woken. Anything outside it is a render
         * for nothing.
         */
        let mayWakeHand = false;

        if (has === undefined || choice < 0.3) {
            const row: TRow = { id, rank: Math.floor(random() * 20), label: `l${Math.floor(random() * 5)}` };
            rowsContentService.upsertEntity(rows, { ...row });
            model.set(id, row);
        } else if (choice < 0.45) {
            // A column nothing reads. Nothing in this collection reads any
            // column, so this is the plainest case of a write that must wake
            // nobody.
            const label = `l${Math.floor(random() * 5)}`;
            rowsContentService.updateEntity(rowsService.getSlotByKey(rows, id), { label });
            model.set(id, { ...has, label });
        } else if (choice < 0.62) {
            const rank = Math.floor(random() * 20);
            rowsContentService.updateEntity(rowsService.getSlotByKey(rows, id), { rank });
            model.set(id, { ...has, rank });
        } else if (choice < 0.85) {
            // The caller decides this bucket's slots, and it is decided over the
            // whole population — a window, a search result, a server's page.
            const wanted = Array.from(model.keys()).filter(() => random() < 0.5);
            mayWakeHand = wanted.join(',') !== handModel.join(',');
            handModel = wanted;
            send();
        } else if (choice < 0.95) {
            mayWakeHand = handModel.includes(id);
            rowsContentService.deleteEntity(rowsService.getSlotByKey(rows, id));
            model.delete(id);
            // The value went; the bucket's slots are the caller's, so the caller
            // takes it out. Left in, the row would sit in the list holding no
            // value at all — which is a state this collection permits and this
            // script is not composing.
            handModel = handModel.filter((key) => key !== id);
            send();
        } else {
            // Emptied entirely — the case the single bucket has to survive.
            mayWakeHand = handModel.length > 0;
            rowsContentService.clearAllEntities(rows);
            model.clear();
            handModel = [];
            singleContentService.clearBucketMemberSlots(singleService.getSingleSlot(single));
        }

        db.flush();

        const where = `seed ${seed}, step ${step}`;
        assertConsistent(entitiesUnderTest(rowsService, rows), [asCollectionOfOne(singleService, single)], where);
        assertPermanentBucket(singleService, single, watchedSingleSlot, where);

        const fromEngineHand = engineView();
        expect({ where, view: fromEngineHand }).toEqual({ where, view: handModel });

        if (wokeHand > 0 && !mayWakeHand) {
            throw new Error(
                `${where}: the hand-filled bucket was woken ${wokeHand} time(s) by a write that did not change ` +
                'the slots its caller set. Nothing in this collection reads the entity at all.',
            );
        }
        if (fromEngineHand.join(',') !== shownHand.join(',') && wokeHand === 0) {
            throw new Error(
                `${where}: the hand-filled bucket went from [${shownHand.join(', ')}] to ` +
                `[${fromEngineHand.join(', ')}] and its effect was never woken.`,
            );
        }
        shownHand = fromEngineHand;
    }
};

describe('one permanent bucket, against a model too simple to be wrong', () => {
    for (const seed of [1, 3, 8, 21, 55, 4242]) {
        it(`holds the list its caller sent, and is woken by nothing else (seed ${seed})`, () => {
            run(seed, 200);
        });
    }
});

describe('the single bucket, with nobody watching it', () => {
    it('is released when its hand-filled list is set to nothing, and the refill goes into a fresh bucket', () => {
        const { db, rowsService, rows, singleService, single } = createFixture();
        const singleContentService = singleService.slotContentService;
        rowsService.slotContentService.upsertEntities(rows, [
            { id: 'k1', rank: 2, label: 'a' },
            { id: 'k2', rank: 1, label: 'b' },
        ]);
        db.flush();
        const filledSingleSlot = singleService.getSingleSlot(single);
        singleContentService.writeBucketMemberSlots(filledSingleSlot, [rowsService.getSlotByKey(rows, 'k1'), rowsService.getSlotByKey(rows, 'k2')]);
        db.flush();
        expect(singleService.getSingleSlot(single)).toBe(filledSingleSlot);
        expect(singleContentService.getBucketMemberSlotCount(filledSingleSlot)).toBe(2);

        singleContentService.writeBucketMemberSlots(filledSingleSlot, []);
        db.flush();

        expect(oimIsSlotReleased(filledSingleSlot)).toBe(true);
        const freshSingleSlot = singleService.getSingleSlot(single);
        expect(freshSingleSlot).not.toBe(filledSingleSlot);
        expect(singleContentService.getBucketMemberSlotCount(freshSingleSlot)).toBe(0);

        singleContentService.writeBucketMemberSlots(singleService.getSingleSlot(single), [rowsService.getSlotByKey(rows, 'k2')]);
        db.flush();
        expect(Array.from(singleContentService.getBucketMemberSlots(singleService.getSingleSlot(single))).map((slot) => (slot.entity as TRow).id)).toEqual(['k2']);
    });

    // Emptying the POPULATION empties no bucket: the rows lose their values and
    // keep their places, the way a page of ids holds before the rows arrive.
    it('keeps the slots its caller set when the population is emptied', () => {
        const { db, rowsService, rows, singleService, single } = createFixture();
        const singleContentService = singleService.slotContentService;
        rowsService.slotContentService.upsertEntities(rows, [
            { id: 'k1', rank: 2, label: 'a' },
            { id: 'k2', rank: 1, label: 'b' },
        ]);
        db.flush();
        const filledSingleSlot = singleService.getSingleSlot(single);
        singleContentService.writeBucketMemberSlots(filledSingleSlot, [rowsService.getSlotByKey(rows, 'k1'), rowsService.getSlotByKey(rows, 'k2')]);
        db.flush();

        rowsService.slotContentService.clearAllEntities(rows);
        db.flush();

        expect(singleContentService.getBucketMemberSlotCount(singleService.getSingleSlot(single))).toBe(2);
        expect(Array.from(singleContentService.getBucketMemberSlots(singleService.getSingleSlot(single))).map((slot) => slot.entity)).toEqual([undefined, undefined]);
        // The identities are still the collection's, because a slot's place in a
        // bucket is a reference and nothing else was holding them.
        expect(rowsService.getSlotCount(rows)).toBe(2);

        // And the caller taking the list away is what lets them go.
        singleContentService.clearBucketMemberSlots(singleService.getSingleSlot(single));
        db.flush();
        expect(rowsService.getSlotCount(rows)).toBe(0);
        expect(oimIsSlotReleased(filledSingleSlot)).toBe(true);
    });
});
