import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMSlotStoreServiceTreeDriven } from '../OIMSlotStoreServiceTreeDriven';
import { OIMDefaults } from '../../../factories/OIMDefaults';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../types/TOIMStoreKey';
import type { TOIMSlotStoreTree } from '../types/TOIMSlotStoreTree';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TProgress = { userId: string; cardId: string; box: number };
type TNamed = { id: string };
type TChain = readonly TOIMEntitySlot[];
type TProgressSlot = TOIMEntitySlot<TProgress, TChain>;
type TProgressStore = TOIMSlotStoreTree<TProgressSlot, TOIMEntitySlot>;
const createNamedService = (db: OIMDB) => createOIMEntityService<TNamed>(db, { keyOf: (item) => item.id });
type TNamedService = ReturnType<typeof createNamedService>;
type TNamedStoreSlot = ReturnType<TNamedService['createStoreSlot']>;

function createFixture() {
    const db = new OIMDB();
    const write =createOIMEntityWriterInPlace();
    const usersService = createNamedService(db);
    const users = usersService.createStoreSlot(db);
    const cardsService = createNamedService(db);
    const cards = cardsService.createStoreSlot(db);
    // THE HOLD IS KEPT for the life of the fixture: a composite key is a chain of
    // IDENTITIES, so a segment that went would make `at('u1','c1')` a second chain.
    const segment = (
        collectionService: TNamedService, collection: TNamedStoreSlot, id: string,
    ): TOIMEntitySlot<TNamed, TOIMStoreKey> => collectionService.holdSlotByKey(collection, id);
    const progressService = createOIMEntityService<TProgress, TOIMEntityColumnName<TProgress>, TChain, TProgressStore>(db, {
        entitySlotStoreService:
            new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TProgressSlot>(
                OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue(),
            ),
        keyOf: (item: TProgress) => [segment(usersService, users, item.userId), segment(cardsService, cards, item.cardId)],
        entityWriter: write,
    });
    const progress = progressService.createStoreSlot(db);
    const at =(userId: string, cardId: string): TChain =>
        [segment(usersService, users, userId), segment(cardsService, cards, cardId)];
    /**
     * The identity at a composite key, minted if there is none — AND THE HOLD IS
     * KEPT, recorded per slot so that {@link letGo} can hand back exactly one.
     *
     * Same reason as {@link segment}: a composite key that has never been
     * written has no value to keep it, so a give-back here would unfile the very
     * identity every case goes on to compare.
     *
     * A second hold of a key this already holds is given back at once — one is
     * enough to keep it, and stacking them would make {@link letGo} a half
     * measure.
     */
    const heldSlots = new Set<TOIMEntitySlot<TProgress, TChain>>();
    const slotAt = (key: TChain): TOIMEntitySlot<TProgress, TChain> => {
        const heldSlot = progressService.holdSlotByKey(progress, key);
        if (heldSlots.has(heldSlot)) heldSlot.owner.unholdSlot(heldSlot);
        else heldSlots.add(heldSlot);
        return heldSlot;
    };
    /** Hand back the hold {@link slotAt} took on one identity, and only that one. */
    const letGo = (slot: TOIMEntitySlot<TProgress, TChain>): void => {
        if (!heldSlots.has(slot)) return;
        heldSlots.delete(slot);
        slot.owner.unholdSlot(slot);
    };
    return { db, usersService, users, cardsService, cards, progressService, progress, at, segment, slotAt, letGo };
}

describe('a collection keyed by a combination of identities', () => {
    it('a rebuilt key (a fresh array of the same segments) resolves to the same slot', () => {
        const { db, progressService, progress, at, slotAt } = createFixture();
        progressService.slotContentService.upsertEntity(progress, { userId: 'u1', cardId: 'c1', box: 1 });
        db.flush();

        const first = slotAt(at('u1', 'c1'));
        const second = slotAt(at('u1', 'c1')); // independently built array

        expect(first).toBe(second);
    });

    it('[a,b] does not collide with [b,a]', () => {
        const { at, slotAt } = createFixture();

        const ab = slotAt(at('u1', 'u2')); // reuse names as both roles
        const ba = slotAt(at('u2', 'u1'));

        expect(ab).not.toBe(ba);
    });

    it('[a,b] does not collide with [a,c]', () => {
        const { at, slotAt } = createFixture();

        const ab = slotAt(at('u1', 'c1'));
        const ac = slotAt(at('u1', 'c2'));

        expect(ab).not.toBe(ac);
    });

    it('[a,b] does not collide with the prefix [a]', () => {
        const { usersService, users, at, segment, slotAt } = createFixture();

        const ab = slotAt(at('u1', 'c1'));
        const a = slotAt([segment(usersService, users, 'u1')]);

        expect(ab).not.toBe(a);
    });

    it('a held-but-unwritten prefix reserves its own key, growing the collection', () => {
        const { db, progressService, progress, usersService, users, segment, slotAt } = createFixture();
        progressService.slotContentService.upsertEntity(progress, { userId: 'u1', cardId: 'c1', box: 1 });
        db.flush();
        expect(progressService.getSlotCount(progress)).toBe(1);

        slotAt([segment(usersService, users, 'u1')]); // holding [u1] alone

        expect(progressService.getSlotCount(progress)).toBe(2);
    });

    it('write and read on a composite-key slot', () => {
        const { db, progressService, progress, at } = createFixture();
        progressService.slotContentService.upsertEntity(progress, { userId: 'u1', cardId: 'c1', box: 1 });
        db.flush();

        expect(progressService.getSlotByKey(progress, at('u1', 'c1'))?.entity?.box).toBe(1);
    });

    it('an effect on a composite-key slot wakes on a write to that slot', () => {
        const { db, progressService, progress, at } = createFixture();
        progressService.slotContentService.upsertEntity(progress, { userId: 'u1', cardId: 'c1', box: 1 });
        db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, [progressService.getSlotByKey(progress, at('u1', 'c1'))!], [], () => { runCount++; });
        progressService.slotContentService.updateEntity(progressService.findSlotByKey(progress, at('u1', 'c1'))!, { box: 5 });
        db.flush();

        expect(runCount).toBe(1);
        expect(progressService.getSlotByKey(progress, at('u1', 'c1'))?.entity)
            .toEqual({ userId: 'u1', cardId: 'c1', box: 5 });
    });

    it('a column effect on a composite-key slot wakes only for that column', () => {
        const { db, progressService, progress, at } = createFixture();
        progressService.slotContentService.upsertEntity(progress, { userId: 'u1', cardId: 'c2', box: 2 });
        db.flush();

        let columnWoke = 0;
        OIMEffectService.INSTANCE.createEffect(
            db,
            [progressService.getColumn(progressService.getSlotByKey(progress, at('u1', 'c2'))!, 'box')],
            [],
            () => { columnWoke++; },
        );
        progressService.slotContentService.updateEntity(progressService.findSlotByKey(progress, at('u1', 'c2'))!, { box: 7 });
        db.flush();

        expect(columnWoke).toBe(1);
    });

    /**
     * A composite-keyed slot is a slot: whatever keys it, it can go in a bucket
     * keyed by something else entirely — here, by one of its own
     * segments.
     *
     * Nothing derives a bucket's slots, so what the case shows is that a chain-keyed
     * identity goes into a key-keyed bucket and is read back out of it with no
     * translation anywhere — which is what makes composite keying usable from a
     * screen that groups by a string.
     */
    it('a composite-key slot can go in a bucket keyed by one of its own segments', () => {
        const { db, progressService, progress, at } = createFixture();
        progressService.slotContentService.upsertEntities(progress, [
            { userId: 'u1', cardId: 'c1', box: 1 },
            { userId: 'u1', cardId: 'c2', box: 2 },
            { userId: 'u2', cardId: 'c1', box: 3 },
        ]);
        db.flush();

        const byUserService = createOIMBucketService<
            TOIMEntitySlot<TProgress, TChain>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TProgress, TChain>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TProgress, TChain>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TProgress, TChain>>() });
        const byUser = byUserService.createStoreSlot(db);
        // KEPT for the reason `segment` is: this is called again on the assertion
        // lines, and a bucket nothing holds would be a fresh empty one every time.
        const bucketFor = (key: TOIMStoreKey): TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<TProgress, TChain>>, TOIMStoreKey> =>
            byUserService.holdSlotByKey(byUser, key);

        byUserService.slotContentService.writeBucketMemberSlots(bucketFor('u1'), [
            progressService.getSlotByKey(progress, at('u1', 'c1'))!,
            progressService.getSlotByKey(progress, at('u1', 'c2'))!,
        ]);
        byUserService.slotContentService.writeBucketMemberSlots(bucketFor('u2'), [progressService.getSlotByKey(progress, at('u2', 'c1'))!]);

        expect(byUserService.slotContentService.getBucketMemberSlotCount(bucketFor('u1'))).toBe(2);
        expect(byUserService.slotContentService.getBucketMemberSlotCount(bucketFor('u2'))).toBe(1);
    });

    it('removal releases the key and prunes the chain', () => {
        const { db, progressService, progress, at } = createFixture();
        progressService.slotContentService.upsertEntities(progress, [
            { userId: 'u1', cardId: 'c1', box: 1 },
            { userId: 'u1', cardId: 'c2', box: 2 },
            { userId: 'u2', cardId: 'c1', box: 3 },
        ]);
        db.flush();
        expect(progressService.getSlotCount(progress)).toBe(3);

        const chain = at('u2', 'c1');
        const removed = progressService.getSlotByKey(progress, chain);
        const segmentHoldsWhileTheChainIsFiled = chain[0].holdCount;

        progressService.slotContentService.deleteEntity(removed);
        db.flush();

        expect(oimIsSlotReleased(removed)).toBe(true);
        expect(progressService.getSlotCount(progress)).toBe(2);
        expect(chain[0].holdCount).toBe(segmentHoldsWhileTheChainIsFiled - 1);
    });

    it('an empty key is refused', () => {
        const { progressService, progress } = createFixture();

        expect(() => progressService.holdSlotByKey(progress, [])).toThrow(/empty key/);
    });

    it('a caller may reuse one array across calls: releasing one key leaves the other alone', () => {
        const { db, usersService, users, cardsService, cards, progressService, progress, segment, slotAt, letGo } = createFixture();
        // One scratch buffer, rewritten between calls — which the engine treats
        // as supported everywhere else, because every other place copies.
        const buffer: TOIMEntitySlot[] = [segment(usersService, users, 'u1'), segment(cardsService, cards, 'c1')];
        const first = slotAt(buffer);
        buffer[1] = segment(cardsService, cards, 'c2');
        const second = slotAt(buffer);
        expect(first).not.toBe(second);

        // Nothing holds the first key, so it goes — and it must take ITS own
        // subtree with it. Holding the caller's array instead pruned whatever
        // the buffer said at this moment, unlinking the second key while its
        // slot stayed in the collection.
        //
        // `remove` first, then the resolver's own hold: the release is asked at
        // both, and it is the SECOND that is the last reference. `letGo` is per
        // identity for exactly this — handing back every hold here would take the
        // second key with it, which is the opposite of what this asserts.
        progressService.slotContentService.deleteEntity(first);
        letGo(first);
        db.flush();

        expect(progressService.getSlotByKey(progress, [segment(usersService, users, 'u1'), segment(cardsService, cards, 'c2')])).toBe(second);
        expect(progressService.getSlotCount(progress)).toBe(1);
    });
});

describe('a composite-keyed slot names itself', () => {
    it('carries the identities it was built from, and still does once removed', () => {
        const { db, progressService, progress, at } = createFixture();
        progressService.slotContentService.upsertEntity(progress, { userId: 'u1', cardId: 'c1', box: 1 });
        db.flush();

        const slot = progressService.getSlotByKey(progress, at('u1', 'c1'))!;
        const name = (s: TOIMEntitySlot<TProgress, TChain>): string =>
            s.key.map(part => String(part.key)).join('|');
        expect(name(slot)).toBe('u1|c1');

        // The point of the field: after removal the value is gone, so an
        // outward mirror has nothing else left to say WHICH slot it must delete.
        let held = 0;
        OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { held++; });
        progressService.slotContentService.deleteEntity(slot);
        db.flush();
        expect(oimIsSlotEmpty(slot)).toBe(true);
        expect(name(slot)).toBe('u1|c1');
        // The effect is what carried the identity past its value.
        expect(held).toBe(1);
    });

    it('leaves a scalar-keyed slot carrying its scalar and nothing around it', () => {
        const { db, usersService, users } = createFixture();
        usersService.slotContentService.upsertEntity(users, { id: 'r1' });
        db.flush();
        const slot = usersService.getSlotByKey(users, 'r1')!;
        expect(slot.key).toBe('r1');
        expect(Array.isArray(slot.key)).toBe(false);
    });
});
