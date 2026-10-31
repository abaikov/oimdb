import { OIMDB } from '../../db/OIMDB';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: TOIMStoreKey };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    return { cardsService, cards: cardsService.createStoreSlot(db) };
};



describe('the container answering, at the values a hand-written rule gets wrong', () => {
    it('resolves one identity at a key that is not equal to itself', () => {
        const { cardsService, cards } = createFixture();
        const firstSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        // The same key, handed in again, is the same identity and no second
        // mint — which is what the memo was an optimisation OF.
        const secondSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        expect(secondSlot).toBe(firstSlot);
        // And the read agrees with the door.
        expect(cardsService.getSlotByKey(cards,Number.NaN)).toBe(firstSlot);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        firstSlot.owner.unholdSlot(firstSlot);
        secondSlot.owner.unholdSlot(secondSlot);
    });

    /**
     * The pair of keys the deleted memo held one cell for: a second key in
     * between must not cost the first its identity.
     */
    it('gives the same identity back after another key has been resolved in between', () => {
        const { cardsService, cards } = createFixture();
        const firstSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        cardsService.holdSlotByKey(cards,'spades');
        const otherSlot = cardsService.getSlotByKey(cards,'spades')!;
        expect(otherSlot).not.toBe(firstSlot);
        expect(cardsService.holdSlotByKey(cards,Number.NaN)).toBe(firstSlot);
        expect(cardsService.getSlotCount(cards)).toBe(2);
    });

    /**
     * `-0` and `0` are ONE key, because they are one key to the `Map`. A store
     * that used `Object.is` would mint two identities here and write values into
     * whichever one the last write resolved.
     */
    it('treats a negative zero and a zero as one key', () => {
        const { cardsService, cards } = createFixture();
        const firstSlot = cardsService.holdSlotByKey(cards,-0);
        expect(cardsService.holdSlotByKey(cards,0)).toBe(firstSlot);
        expect(cardsService.getSlotByKey(cards,0)).toBe(firstSlot);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    /**
     * AND THE WRITE DOOR AGREES WITH THE HOLD DOOR, which is the half the store
     * tests could not reach: a bucket store had no value to put anywhere. An
     * entity written under `NaN` lands in the identity a hold resolved, rather
     * than in a second one nothing can find again.
     */
    it('writes into the identity a hold already resolved at that key', () => {
        const { cardsService, cards } = createFixture();
        const heldSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        const written = cardsService.writeSlotContentByKey(cards, Number.NaN, { id: Number.NaN });

        expect(written).toBe(heldSlot);
        expect(cardsService.getSlotCount(cards)).toBe(1);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});
