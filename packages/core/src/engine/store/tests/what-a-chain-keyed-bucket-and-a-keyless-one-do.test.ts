import { OIMDefaults } from '../../../factories/OIMDefaults';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMSingleBucketService } from '../../../factories/createOIMSingleBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import type { TOIMSlotStoreTree } from '../types/TOIMSlotStoreTree';
import {
    OIMDB,
    OIMSlotStoreServiceTreeDriven,
    createOIMEntityService,
    oimIsSlotEmpty,
    oimIsSlotReleased,
} from '../../../index';
import type { TOIMBucketSlot, TOIMEntitySlot, TOIMBucketSlotsArrayStore } from '../../../index';

type TMessage = { id: string; roomId: string; authorId: string; text: string };
type TNamed = { id: string };
type TMessageSlot = TOIMEntitySlot<TMessage>;
type TChain = readonly TOIMEntitySlot[];
type TPinned = TOIMBucketSlot<TOIMBucketSlotsArrayStore<TMessageSlot>, TChain>;
type TPinnedStore = TOIMSlotStoreTree<TPinned, TOIMEntitySlot>;

const createPinnedService = (db: OIMDB) => createOIMBucketService<
    TMessageSlot, TChain, TOIMBucketSlotsArrayStore<TMessageSlot>, OIMSlotContentBucketServiceArrayDriven<TMessageSlot>, TPinnedStore
>(db, {
    slotContentService: new OIMSlotContentBucketServiceArrayDriven<TMessageSlot>(),
    bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TPinned>(OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue()),
});

function createFixture() {
    const db = new OIMDB();
    const roomsService = createOIMEntityService<TNamed>(db, { keyOf: room => room.id });
    const rooms = roomsService.createStoreSlot(db);
    const usersService = createOIMEntityService<TNamed>(db, { keyOf: user => user.id });
    const users = usersService.createStoreSlot(db);
    const messagesService = createOIMEntityService<TMessage>(db, { keyOf: message => message.id });
    const messages = messagesService.createStoreSlot(db);
    // The segments a chain is built out of are ORDINARY identities, so they are
    // written rather than resolved.
    roomsService.slotContentService.upsertEntities(rooms, [{ id: 'general' }]);
    usersService.slotContentService.upsertEntities(users, [{ id: 'ann' }, { id: 'bob' }]);
    messagesService.slotContentService.upsertEntities(messages, [
        { id: 'm1', roomId: 'general', authorId: 'ann', text: 'one' },
        { id: 'm2', roomId: 'general', authorId: 'ann', text: 'two' },
        { id: 'm3', roomId: 'general', authorId: 'bob', text: 'three' },
    ]);
    db.flush();
    return { db, roomsService, rooms, usersService, users, messagesService, messages };
}

describe('Hand-set slots, keyed by a chain of identities', () => {
    /** Pinned messages, per user, per room — nothing selects them, and the key is a pair. */
    function pin() {
        const { db, roomsService, rooms, usersService, users, messagesService, messages } = createFixture();
        const pinnedService = createPinnedService(db);
        const pinned = pinnedService.createStoreSlot(db);
        const chainFor = (userId: string): TChain =>
            [roomsService.getSlotByKey(rooms, 'general')!, usersService.getSlotByKey(users, userId)!];
        // THE REFERENCE IS KEPT, per user, so a case can hand back exactly the one
        // it is asking about; `bobInGeneral` is a bucket no case ever fills.
        const holds = new Map<string, TPinned>();
        const at = (userId: string): TPinned => {
            const held = pinnedService.holdSlotByKey(pinned, chainFor(userId));
            holds.set(userId, held);
            return held;
        };
        /** Give back the resolver's hold on one user's bucket, and only that one. */
        const letGoOf = (userId: string): void => {
            const pinnedSlot = holds.get(userId) as TPinned;
            pinnedSlot.owner.unholdSlot(pinnedSlot);
            holds.delete(userId);
        };
        return {
            db, roomsService, rooms, usersService, users, messagesService, messages, pinnedService, pinned, chainFor, letGoOf,
            annInGeneral: at('ann'), bobInGeneral: at('bob'),
        };
    }

    it('holds a hand-written list of slots under a pair of identities', () => {
        const { db, messagesService, messages, pinnedService, annInGeneral } = pin();
        pinnedService.slotContentService.writeBucketMemberSlots(annInGeneral, [messagesService.getSlotByKey(messages, 'm2')!, messagesService.getSlotByKey(messages, 'm1')!]);
        db.flush();
        expect(Array.from(pinnedService.slotContentService.getBucketMemberSlots(annInGeneral)).map(slot => slot.key)).toEqual(['m2', 'm1']);
    });

    it('two chains sharing a segment are two buckets', () => {
        const { db, messagesService, messages, pinnedService, pinned, chainFor, annInGeneral, bobInGeneral } = pin();
        expect(annInGeneral).not.toBe(bobInGeneral);
        pinnedService.slotContentService.writeBucketMemberSlots(annInGeneral, [messagesService.getSlotByKey(messages, 'm1')!]);
        pinnedService.slotContentService.writeBucketMemberSlots(bobInGeneral, [messagesService.getSlotByKey(messages, 'm3')!]);
        db.flush();
        expect(pinnedService.slotContentService.getBucketMemberSlotCount(annInGeneral)).toBe(1);
        expect(pinnedService.slotContentService.getBucketMemberSlotCount(bobInGeneral)).toBe(1);
        // Rebuilding the same chain answers with the same bucket, so nothing had
        // to be kept by the caller.
        expect(pinnedService.getSlotByKey(pinned, chainFor('ann'))).toBe(annInGeneral);
    });

    /**
     * A REMOVED MESSAGE STAYS PINNED, AND THAT IS THE CONTRACT.
     *
     * `OIMSlotContentEntityService.deleteEntity` clears the value and does nothing else: an
     * entity does not derive which buckets hold it, so nothing there could know
     * which buckets this one is in without scanning every bucket collection in
     * the process.
     *
     * What is left in the bucket is a slot holding no value — the same thing a
     * bucket resolved before its entities arrived already holds, which every
     * reader of `OIMSlotContentBucketService.getBucketMemberSlots` already answers for. Taking it out is
     * the caller's, and it is the same call that put it in. Both halves are
     * asserted here, because the first without the second reads as a leak and
     * the second without the first reads as an automatic eviction.
     */
    it('a removed message stays pinned until the caller takes it out', () => {
        const { db, messagesService, messages, pinnedService, annInGeneral } = pin();
        pinnedService.slotContentService.writeBucketMemberSlots(annInGeneral, [messagesService.getSlotByKey(messages, 'm1')!, messagesService.getSlotByKey(messages, 'm2')!]);
        db.flush();

        const pinnedM1 = messagesService.getSlotByKey(messages, 'm1')!;
        messagesService.slotContentService.deleteEntity(pinnedM1);
        db.flush();

        // Still in the bucket, and that is what keeps the identity alive.
        expect(Array.from(pinnedService.slotContentService.getBucketMemberSlots(annInGeneral)).map(slot => slot.key)).toEqual(['m1', 'm2']);
        expect(oimIsSlotEmpty(pinnedM1)).toBe(true);

        // The caller takes it out, which is the same call that put it in.
        pinnedService.slotContentService.writeBucketMemberSlots(annInGeneral, [messagesService.getSlotByKey(messages, 'm2')!]);
        db.flush();

        expect(Array.from(pinnedService.slotContentService.getBucketMemberSlots(annInGeneral)).map(slot => slot.key)).toEqual(['m2']);
        // The last bucket that held it let it go and it has no value, so the
        // identity is not the collection's any more.
        expect(oimIsSlotReleased(pinnedM1)).toBe(true);
        expect(messagesService.getSlotCount(messages)).toBe(2);
    });

    it('emptying it lets the tree go, so a query per pair does not leak nodes', () => {
        const { db, messagesService, messages, pinnedService, pinned, chainFor, annInGeneral, letGoOf } = pin();
        pinnedService.slotContentService.writeBucketMemberSlots(annInGeneral, [messagesService.getSlotByKey(messages, 'm1')!]);
        db.flush();
        // TWO: ann's, kept by the message just pinned in it, and bob's, kept by
        // the hold `pin()` took when it resolved the pair. Both are filed, which
        // is what makes the drop below a fact about emptying rather than about
        // never having been there.
        expect(pinnedService.getSlotCount(pinned)).toBe(2);
        const annChain = chainFor('ann');
        const segmentHoldsWhileTheChainIsFiled = annChain[1].holdCount;

        pinnedService.slotContentService.writeBucketMemberSlots(annInGeneral, []);
        // The slots are gone; this is the last thing pointing at ann's
        // bucket, and the collection is asked at the give-back. Without it the
        // assertions below would be asking whether a bucket somebody still holds
        // is dropped, and the answer to that is correctly no.
        letGoOf('ann');
        db.flush();
        // Nobody holds it and it has no slots, so the collection dropped it and
        // the store pruned the nodes that existed only to reach it.
        expect(Array.from(pinnedService.getSlots(pinned)).includes(annInGeneral)).toBe(false);
        expect(oimIsSlotReleased(annInGeneral)).toBe(true);
        expect(pinnedService.getSlotCount(pinned)).toBe(1);
        expect(annChain[1].holdCount).toBe(segmentHoldsWhileTheChainIsFiled - 1);
    });
});

describe('Hand-set slots, one bucket under no key at all', () => {
    function hand() {
        const { db, messagesService, messages } = createFixture();
        const shortlistService = createOIMSingleBucketService<TMessageSlot>(db);
        const shortlist = shortlistService.createStoreSlot(db);
        const heldShortlistSlot = shortlistService.holdSingleSlot(shortlist);
        return { db, messagesService, messages, shortlistService, shortlist, heldShortlistSlot };
    }

    it('is one hand-filled bucket that nothing filed, so nothing can unfile it while it is held', () => {
        const { db, messagesService, messages, shortlistService, shortlist, heldShortlistSlot } = hand();
        expect(oimIsSlotReleased(heldShortlistSlot)).toBe(false);

        shortlistService.slotContentService.writeBucketMemberSlots(shortlistService.getSingleSlot(shortlist),[messagesService.getSlotByKey(messages, 'm3')!, messagesService.getSlotByKey(messages, 'm1')!]);
        db.flush();
        expect(Array.from(shortlistService.slotContentService.getBucketMemberSlots(shortlistService.getSingleSlot(shortlist))).map(slot => slot.key)).toEqual(['m3', 'm1']);
        expect(oimIsSlotReleased(heldShortlistSlot)).toBe(false);
        expect(shortlistService.getSingleSlot(shortlist)).toBe(heldShortlistSlot);
        expect(shortlistService.getSingleSlot(shortlist).owner).toBe((shortlistService as unknown as { slotOwnerService: unknown }).slotOwnerService);
    });

    /**
     * A write reaches no bucket collection at all, so a bucket under no key is
     * no different from any other here. The case stays because "one bucket for
     * everything" is the sentence a reader expects to be wrong.
     */
    it('nothing joins it on a write, because nothing selects', () => {
        const { db, messagesService, messages, shortlistService, shortlist } = hand();
        messagesService.slotContentService.upsertEntity(messages, { id: 'm4', roomId: 'general', authorId: 'ann', text: 'four' });
        db.flush();
        expect(shortlistService.slotContentService.getBucketMemberSlotCount(shortlistService.getSingleSlot(shortlist))).toBe(0);
    });

    it('the sole bucket survives being emptied by hand while it is held', () => {
        const { db, messagesService, messages, shortlistService, shortlist, heldShortlistSlot } = hand();
        shortlistService.slotContentService.writeBucketMemberSlots(shortlistService.getSingleSlot(shortlist),[messagesService.getSlotByKey(messages, 'm1')!]);
        db.flush();

        // Emptied by the caller: `OIMSlotContentEntityService.deleteEntity` leaves the
        // bucket's slots standing — see the chain-keyed case above.
        shortlistService.slotContentService.clearBucketMemberSlots(shortlistService.getSingleSlot(shortlist));
        db.flush();
        expect(shortlistService.slotContentService.getBucketMemberSlotCount(shortlistService.getSingleSlot(shortlist))).toBe(0);
        expect(oimIsSlotReleased(heldShortlistSlot)).toBe(false);
        expect(shortlistService.getSingleSlot(shortlist)).toBe(heldShortlistSlot);
        shortlistService.slotContentService.writeBucketMemberSlots(shortlistService.getSingleSlot(shortlist),[messagesService.getSlotByKey(messages, 'm2')!]);
        expect(Array.from(shortlistService.slotContentService.getBucketMemberSlots(shortlistService.getSingleSlot(shortlist))).map(slot => slot.key)).toEqual(['m2']);
    });
});

describe('a chain-keyed bucket carries the whole chain as its key', () => {
    /**
     * WHAT IS GUARDED AGAINST IS A SCALAR TAKEN FROM ONE SEGMENT: it names BOTH
     * buckets, so it is not a name — it is a collision waiting for a consumer
     * that reads `bucket.key` as an id, and `@oimdb/redux-adapter` did exactly
     * that.
     *
     * A keyed slot carries its own key whatever its shape (`TOIMKeyedSlot.key`),
     * and `OIMSlotStoreServiceTreeDriven.set` writes the whole CHAIN there —
     * copied, so a caller reusing one buffer cannot move it. The key is the chain
     * and never one segment of it, and two chains sharing a segment carry two
     * different keys.
     */
    it('does not borrow the last segment, because two chains can end on the same identity', () => {
        const { db, roomsService, rooms, usersService, users } = createFixture();
        const pinnedService = createPinnedService(db);
        const pinned = pinnedService.createStoreSlot(db);
        const general = roomsService.getSlotByKey(rooms, 'general')!;
        const ann = usersService.getSlotByKey(users, 'ann')!;
        const bob = usersService.getSlotByKey(users, 'bob')!;
        const annHere = pinnedService.holdSlotByKey(pinned, [ann, general]);
        const bobHere = pinnedService.holdSlotByKey(pinned, [bob, general]);

        expect(annHere).not.toBe(bobHere);
        // Compared segment by segment rather than as whole objects: a slot
        // carries its owner, so a deep compare would walk the collection.
        expect(annHere.key).toHaveLength(2);
        expect(annHere.key[0]).toBe(ann);
        expect(annHere.key[1]).toBe(general);
        // The last segment is shared and the keys are not, which is the whole
        // claim: a scalar borrowed from it would have named both.
        expect(bobHere.key[0]).toBe(bob);
        expect(bobHere.key[1]).toBe(general);
        expect(annHere.key[0]).not.toBe(bobHere.key[0]);
    });
});
