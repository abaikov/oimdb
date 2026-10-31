import { OIMDB, OIMPositionalArrayBucketContentService, OIMSetBucketContentService, createOIMInPlaceEntityWriter, oimGuardedPatchEntityColumns, oimGuardedPatchEntityColumn, oimGuardedPutEntityColumns, oimIsSlotEmpty, oimIsSlotReleased } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';

type TCard = { id: string; deckId: string };
type TSettings = { theme: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;

/**
 * A hand-filled list holding two slots: an identity whose entity has not
 * arrived, and one that carries a value.
 *
 * The reserved identity is what makes a departure observable. A slot that holds
 * a value is declined by its owner however the departure was reported, so it
 * cannot tell a reported departure from an unreported one; a reserved one is
 * released exactly when the last thing pointing at it lets go AND says so.
 */
const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    // Positions are the caller's here, which is what these
    // writes are.
    const membersService = new OIMPositionalArrayBucketContentService<TCardSlot>();
    const listService = createOIMSlotCollectionService({ slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    cardsService.writeSlotContentByKey(cards, 'kept', { id: 'kept', deckId: 'spades' });
    db.flush();
    // Held, so the list itself cannot be unfiled by a write that empties it —
    // what these cases are about is the SLOT's departure, not the bucket's.
    const bucket = listService.holdSlotByKey(list, 'inbox');
    // A key with no entity, and the hold is KEPT until the bucket below holds it:
    // given back here it has no value, no listener and no bucket, so it would go.
    const heldGhostSlot = cardsService.holdSlotByKey(cards, 'ghost');
    const ghost = heldGhostSlot;
    const kept = cardsService.getSlotByKey(cards, 'kept')!;
    membersService.insertBucketMemberSlotAt(bucket, membersService.getBucketMemberSlotCount(bucket), ghost);
    membersService.insertBucketMemberSlotAt(bucket, membersService.getBucketMemberSlotCount(bucket), kept);
    // AND ONLY NOW. From this line the bucket is the whole of what holds the
    // reserved identity, which is the precondition every case below needs.
    heldGhostSlot.owner.unholdSlot(heldGhostSlot);
    db.flush();
    expect(cardsService.getSlotByKey(cards, 'ghost')).toBe(ghost);
    expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
    return { db, cardsService, cards, membersService, listService, list, bucket, ghost, kept };
};

type TSetup = ReturnType<typeof createFixture>;

/**
 * EVERY WAY OUT: the two position doors that take a slot out, plus `removeSlots`,
 * `clear` and `write`.
 */
const DEPARTURES: readonly { name: string; take: (s: TSetup) => void }[] = [
    { name: 'removeSlotAt', take: s => { s.membersService.removeBucketMemberSlotAt(s.bucket, 0); } },
    { name: 'removeSlotRange', take: s => { s.membersService.removeBucketMemberSlotRange(s.bucket, 0, 1); } },
    { name: 'removeSlots', take: s => { s.membersService.removeBucketMemberSlots(s.bucket, [s.ghost]); } },
    { name: 'clear', take: s => { s.membersService.clearSlotContent(s.bucket); } },
    { name: 'write, replacing the list', take: s => { s.membersService.writeSlotContent(s.bucket, [s.kept]); } },
];

describe('one owner for a departure', () => {
    /**
     * ONE REPORT, whichever of the five. Each takes the reserved identity out of
     * the list, and each has to end with its owner being asked — which, for an
     * identity holding no value that nothing subscribes to, watches or files, is
     * the collection letting go of it.
     *
     * A path that forgot the report leaves the slot filed under its key for the
     * life of the process, and a later resolution of that key hands back an
     * identity two callers disagree about. Nothing throws either way.
     */
    for (const departure of DEPARTURES) {
        it(`${departure.name} reports the departure of a reserved identity`, () => {
            const s = createFixture();
            departure.take(s);
            s.db.flush();

            // The reserved identity had one reference and it just left, so the
            // collection is done with it.
            expect(oimIsSlotReleased(s.ghost)).toBe(true);
            // And the one that carries a value is untouched by any of the five,
            // whether it stayed in the bucket or was put back into it.
            expect(s.cardsService.getSlotByKey(s.cards, 'kept')?.entity?.id).toBe('kept');
        });
    }

    /**
     * AND TAKING THE VALUE AWAY IS NOT A DEPARTURE, which is the other half of
     * "one owner": `remove` empties the slot and reports nothing to any bucket,
     * because a slot's place in a bucket is a fact about the list a caller
     * composed and not about the entity. The identity therefore survives its
     * value — a slot in a bucket is a reference — and goes when the caller takes
     * it out. The opposite (the entity leaving its buckets during the frame) was
     * the derived index's contract and is nobody's now.
     */
    it('keeps a slot whose value was taken away, until the bucket lets it go too', () => {
        const { db, cardsService, cards, membersService, bucket, kept } = createFixture();
        membersService.removeBucketMemberSlotAt(bucket, 0);
        cardsService.slotContentService.clearSlotContent(kept);
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'kept')).toBe(kept);
        expect(oimIsSlotEmpty(kept)).toBe(true);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(1);

        membersService.clearSlotContent(bucket);
        db.flush();
        expect(oimIsSlotReleased(kept)).toBe(true);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(0);
    });
});

describe('what may be a column of a stored entity', () => {
    it('leaves the prototype alone when a standalone record is replaced from a payload under the guarded writer', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TSettings>({ entityWriter: createOIMInPlaceEntityWriter({
                putEntityColumns: oimGuardedPutEntityColumns,
                patchEntityColumns: oimGuardedPatchEntityColumns,
                patchEntityColumn: oimGuardedPatchEntityColumn,
            }) }) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, { theme: 'dark' });

        settingsService.slotContentService.writeSlotContent(settingsService.getSingleSlot(settings), JSON.parse('{"theme":"light","__proto__":{"polluted":true}}') as TSettings);
        db.flush();

        const held = settingsService.getSingleSlot(settings).entity as TSettings;
        expect(held.theme).toBe('light');
        expect(Object.getPrototypeOf(held)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(held, '__proto__')).toBe(false);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});

describe('reaching a bucket\'s slots', () => {
    const byDeckOver = () => {
        const membersService = new OIMSetBucketContentService<TCardSlot>();
        const byDeckService = createOIMSlotCollectionService({ slotContentService: membersService });
        return { byDeckService, membersService };
    };

    /**
     * AND A BUCKET LET GO WHILE EMPTY IS DROPPED — which is what giving a hold
     * back and asking says, and the reason `OIMSlotOwner.holdSlot` exists at
     * all.
     *
     * `OIMSlotOwnerService.releaseSlotIfUnheld` asks the content strategy for its answer
     * without settling the collection's order, and it is right not to: a release
     * runs from inside a write, and an order pass moves no slot in or out, so the
     * size it reads is the size either way. What decides is whether anything
     * holds the bucket — a hold, an effect, or a slot in it.
     *
     * The identity churn this pins is not an endorsement of it. It is what a
     * holder is saying when it gives the hold back and asks, and it is why a
     * consumer keeps the bucket it was given rather than re-resolving the key.
     */
    it('drops a bucket let go while empty, and keeps one that still holds a slot', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
        const cards = cardsService.createStoreSlot(db);
        const { byDeckService, membersService } = byDeckOver();
        const byDeck = byDeckService.createStoreSlot(db);

        const emptySlot = byDeckService.holdSlotByKey(byDeck, 'spades');

        const before = emptySlot;
        emptySlot.owner.unholdSlot(emptySlot);
        db.flush();
        // Nothing held it and nothing was in it, so the key mints afresh.
        expect(oimIsSlotReleased(before)).toBe(true);
        expect(byDeckService.holdSlotByKey(byDeck, 'spades')).not.toBe(before);

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deckId: 'hearts' });
        const filledSlot = byDeckService.holdSlotByKey(byDeck, 'hearts');
        membersService.writeSlotContent(filledSlot, [cardsService.getSlotByKey(cards, 'c1')]);
        db.flush();
        filledSlot.owner.unholdSlot(filledSlot);
        db.flush();

        // A slot in a bucket is a reference like any other, so letting the hold go does
        // not take the bucket with it.
        expect(byDeckService.getSlotByKey(byDeck, 'hearts')).toBe(filledSlot);
        expect(Array.from(membersService.getBucketMemberSlots(filledSlot)).map(slot => slot.entity?.id)).toEqual(['c1']);
        expect(byDeckService.getSlotCount(byDeck)).toBe(2);
    });
});
