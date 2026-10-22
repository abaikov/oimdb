import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMBucketService<
        TOIMEntitySlot<TCard>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>,
        OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>() });
    const byDeck = byDeckService.createStoreSlot(db);
    return { db, cards, cardsService, byDeck, byDeckService };
};

describe('hold adds a hold and nothing else', () => {
    it('names the identity a read names, and keeps the one a read lets go of', () => {
        const { db, byDeck, byDeckService } = createFixture();

        const asked = byDeckService.getSlotByKey(byDeck, 'spades');
        expect(byDeckService.getSlotCount(byDeck)).toBe(1);
        db.flush();
        expect(oimIsSlotReleased(asked)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);

        const heldSlot = byDeckService.holdSlotByKey(byDeck, 'spades');

        expect(byDeckService.getSlotCount(byDeck)).toBe(1);
        expect(byDeckService.getSlotByKey(byDeck, 'spades')).toBe(heldSlot);
        expect(heldSlot.key).toBe('spades');
        // The bucket is filed by the aggregate that minted it — the ONE field a
        // bucket carries that says who may let it go.
        //
        // A second stood beside it: `expect(heldSlot.maintainedBy).toBe(byDeck)`,
        // who brings the bucket current before a consumer arrives. Nothing does,
        // because an ordered bucket's order is a derivation settled by the read.
        expect(heldSlot.owner).toBe((byDeckService as unknown as { slotOwnerService: unknown }).slotOwnerService);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('reads and wakes exactly the same through either door', () => {
        const { db, cards, cardsService, byDeck, byDeckService } = createFixture();
        const heldSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        const bucket = heldSlot;
        const found = byDeckService.getSlotByKey(byDeck, 'spades')!;
        expect(found).toBe(bucket);

        let heldWoke = 0;
        let foundWoke = 0;
        const onHeld = OIMEffectService.INSTANCE.createEffect(db, [bucket], [], () => { heldWoke++; });
        const onFound = OIMEffectService.INSTANCE.createEffect(db, [found], [], () => { foundWoke++; });

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades' });
        // The write files nothing. The one write this bucket gets is the one
        // `write` reports, and it is the same write for both readers.
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        db.flush();

        expect(heldWoke).toBe(1);
        expect(foundWoke).toBe(1);

        const slots = [...byDeckService.slotContentService.getBucketMemberSlots(bucket)];
        expect(slots.length).toBe(1);
        expect(slots[0]).toBe(cardsService.getSlotByKey(cards, 'c1'));
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(1);

        OIMEffectService.INSTANCE.disposeEffect(onHeld);
        OIMEffectService.INSTANCE.disposeEffect(onFound);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('takes one hold, and refuses a give-back that answers no hold', () => {
        const { byDeck, byDeckService } = createFixture();
        const heldSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        expect(heldSlot.holdCount).toBe(1);

        // The read takes none — the hold is the whole of what the other door
        // adds.
        byDeckService.getSlotByKey(byDeck, 'spades');
        byDeckService.getSlotByKey(byDeck, 'spades');
        expect(heldSlot.holdCount).toBe(1);

        heldSlot.owner.unholdSlot(heldSlot);
        expect(heldSlot.holdCount).toBe(0);
        expect(() => { heldSlot.owner.unholdSlot(heldSlot); }).toThrow(/This identity was released/);
        expect(heldSlot.holdCount).toBe(0);
    });

    it('counts one hold per resolve, so one give-back never lets go of another\'s', () => {
        const { byDeck, byDeckService } = createFixture();
        const firstSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        const secondSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        expect(secondSlot).toBe(firstSlot);
        expect(firstSlot.holdCount).toBe(2);

        firstSlot.owner.unholdSlot(firstSlot);
        expect(firstSlot.holdCount).toBe(1);
        // Still filed, because the second handle is still holding it.
        firstSlot.owner.holdSlot(firstSlot);
        firstSlot.owner.unholdSlot(firstSlot);
        expect(byDeckService.getSlotByKey(byDeck, 'spades')).toBe(firstSlot);

        secondSlot.owner.unholdSlot(secondSlot);
        expect(oimIsSlotReleased(secondSlot)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });
});
