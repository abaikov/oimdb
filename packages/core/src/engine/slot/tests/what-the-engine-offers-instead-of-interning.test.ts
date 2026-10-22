import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';

import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string; title: string };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'ace' });
    db.flush();
    return { db, cardsService, cards };
};

describe('what a caller who memoises is promised', () => {
    // FAILS ON: `remove` unfiling a slot a column of which is watched, or an
    // effect's hold no longer reaching `OIMSlotOwnerService.releaseSlotIfUnheld`.
    it('keeps a column memo true across a removal and a re-hydration', () => {
        const { db, cardsService, cards } = createFixture();
        const slot = cardsService.getSlotByKey(cards, 'c1')!;

        let runCount = 0;
        const memo = OIMEffectService.INSTANCE.createEffect(db, [cardsService.getColumn(slot, 'title')], [], () => { runCount++; });
        db.flush();
        runCount = 0;

        cardsService.slotContentService.deleteEntity(slot);
        db.flush();
        // The value left; the identity did not, because this column is watched.
        expect(oimIsSlotEmpty(slot)).toBe(true);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'king' });
        db.flush();
        expect(slot.entity?.title).toBe('king');
        // The identity the binding holds still names the row the collection files.
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);
        // Once for the value leaving and once for its return. A memo that had
        // gone stale would have reported neither and said nothing about it.
        expect(runCount).toBe(2);

        OIMEffectService.INSTANCE.disposeEffect(memo);
    });

    /**
     * The same promise for a subscription to the SLOT, which is the case an
     * adapter is explicitly told it may key on — checked over the same round
     * trip rather than assumed to follow from the one above.
     */
    it('keeps a slot memo true across the same round trip', () => {
        const { db, cardsService, cards } = createFixture();
        const slot = cardsService.getSlotByKey(cards, 'c1')!;
        const memo = OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { /* the reference that keeps the identity */ });

        cardsService.slotContentService.deleteEntity(slot);
        db.flush();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'king' });
        db.flush();

        expect(slot.entity).toEqual({ id: 'c1', deckId: 'spades', title: 'king' });
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);

        OIMEffectService.INSTANCE.disposeEffect(memo);
    });

    // THE BOUNDARY: a slot in a variable is no term `releaseSlotIfUnheld` asks about,
    // so a caller who neither held nor subscribed can have it reclaimed.
    it('lets the identity go when nothing holds it, and leaves such a memo stale for ever', () => {
        const { db, cardsService, cards } = createFixture();
        const stale = cardsService.getSlotByKey(cards, 'c1')!;

        cardsService.slotContentService.deleteEntity(stale);
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(0);

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'king' });
        db.flush();
        const reborn = cardsService.getSlotByKey(cards, 'c1');
        expect(reborn.entity?.title).toBe('king');
        expect(reborn).not.toBe(stale);
        expect(oimIsSlotEmpty(stale)).toBe(true);
    });

    /**
     * THE BUCKET HALF, and the reason a bucket needed no interning of its
     * own: the handle a caller holds — `bucketCollection.holdSlotByKey(key)` —
     * carries a HOLD, and a hold is the reference that keeps the bucket. So the
     * thing interning would have bought here is already bought, by the door the
     * caller went through rather than by a table the engine keeps.
     *
     * THE EMPTYING IS THE CALLER'S, and it has to be: taking a row's value away
     * leaves the slot in its bucket, so the bucket only passes through empty
     * because the caller cleared the list. That makes the case sharper rather
     * than weaker — the emptying is a deliberate act, and the bucket must still
     * be there afterwards.
     *
     * FAILS ON: the hold no longer keeping an empty bucket. A bucket with no
     * slots, no effects and no holds is otherwise nobody's, and
     * `releaseSlotIfUnheld` drops it the moment it is emptied — after which the next
     * `hold` of the same key mints a SECOND bucket, the held handle reads empty
     * for ever, and nothing throws.
     */
    it('keeps a bucket memo true across an emptying, because the handle holds the bucket', () => {
        const { db, cardsService, cards } = createFixture();
        const byDeckService = createOIMBucketService<
            TOIMEntitySlot<TCard, TOIMStoreKey>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard, TOIMStoreKey>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>() });
        const byDeck = byDeckService.createStoreSlot(db);

        const spadesSlot = byDeckService.holdSlotByKey(byDeck, 'spades');

        const bucket = spadesSlot;
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        db.flush();
        expect(bucket.holdCount).toBe(1);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(1);

        cardsService.slotContentService.deleteEntity(cardsService.findSlotByKey(cards, 'c1')!);
        byDeckService.slotContentService.clearBucketMemberSlots(bucket);
        db.flush();
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(0);
        // Empty, unwatched, and still filed — the hold is the only thing that
        // carried it through the frame in which it was nobody's.
        expect(byDeckService.getSlotByKey(byDeck, 'spades')).toBe(bucket);

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'king' });
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        db.flush();
        const bucketSlotsService = [...byDeckService.slotContentService.getBucketMemberSlots(bucket)];
        expect(bucketSlotsService.length).toBe(1);
        expect(bucketSlotsService[0]).toBe(cardsService.getSlotByKey(cards, 'c1'));

        // And the key still resolves to the bucket this handle names.
        const secondSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        expect(secondSlot).toBe(bucket);
        secondSlot.owner.unholdSlot(secondSlot);
        spadesSlot.owner.unholdSlot(spadesSlot);
    });
});

// FAILS ON: an identity handed back freshly, or a mint nobody took surviving
// the flush that is meant to collect it.
describe('every route hands back the identity itself', () => {
    it('answers with the same object every time, and gives back a mint nobody took', () => {
        const { db, cardsService, cards } = createFixture();
        const slot = cardsService.getSlotByKey(cards, 'c1');
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);

        const minted = cardsService.getSlotByKey(cards, 'c2');
        expect(minted.entity).toBeUndefined();
        expect(cardsService.getSlotByKey(cards, 'c2')).toBe(minted);
        expect(cardsService.getSlotCount(cards)).toBe(2);

        db.flush();
        expect(oimIsSlotReleased(minted)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        // A column is minted by the SUBSCRIPTION and by nothing else, and is
        // then the same identity for every subscriber of that column.
        expect(slot.columnSlotStore).toBeUndefined();
        const columnEffect = OIMEffectService.INSTANCE.createEffect(db, [cardsService.getColumn(slot, 'title')], [], () => { /* nothing */ });
        const column = (slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('title');
        expect(column).toBeDefined();

        // And it goes with the last thing that referred to it, so the slot pays
        // nothing for a column nobody watches any more.
        OIMEffectService.INSTANCE.disposeEffect(columnEffect);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(slot.columnSlotStore).toBeUndefined();
    });
});
