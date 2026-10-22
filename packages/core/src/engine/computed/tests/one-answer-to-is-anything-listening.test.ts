import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; title: string };

// Written out rather than imported because there is nothing to import.
const theFieldSaysSomethingIsListening = (slot: TOIMSlot): boolean =>
    slot.effects !== undefined;

/** And the whole line, which is what every one of those sites actually asks. */
const somethingIsListening = (slot: TOIMSlot): boolean =>
    slot.effects !== undefined && slot.effects.length > 0;

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, effectService, cardsService, cards };
};

describe('one answer to "is anything listening"', () => {
    /**
     * THE ORDINARY CASE, and the reason the field read is in front at all: an
     * identity nobody has ever subscribed to has no list to walk, so the two
     * halves agree and the cheap one is enough.
     *
     * A READ NEVER MINTS, so the identity is taken through the door that does.
     */
    it('agrees with the list about a slot nobody has ever subscribed to', () => {
        const { cardsService, cards } = createFixture();
        const ghostSlot = cardsService.holdSlotByKey(cards, 'ghost');
        expect(ghostSlot.effects).toBeUndefined();
        expect(theFieldSaysSomethingIsListening(ghostSlot)).toBe(false);
        expect(somethingIsListening(ghostSlot)).toBe(false);

        ghostSlot.owner.unholdSlot(ghostSlot);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    // The caller's hold is given back at once, so the hold `OIMEffectService` took on
    // the root is the whole of what keeps this identity from that line on.
    it('agrees with the list about a slot that has a listener', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        const ghostSlot = cardsService.holdSlotByKey(cards, 'ghost');
        const effect = effectService.createEffect(db, [ghostSlot], [], () => { /* held */ });
        ghostSlot.owner.unholdSlot(ghostSlot);

        expect(theFieldSaysSomethingIsListening(ghostSlot)).toBe(true);
        expect(somethingIsListening(ghostSlot)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        effectService.disposeEffect(effect);
    });

    // THE MOMENT THEY PART: `slot.effects` still holds the array the first effect
    // minted, so only the `length` half tells the truth about this slot.
    it('lets a slot go once its last effect leaves, with the empty list still on it', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        const ghostSlot = cardsService.holdSlotByKey(cards, 'ghost');
        const effect = effectService.createEffect(db, [ghostSlot], [], () => { /* held */ });
        ghostSlot.owner.unholdSlot(ghostSlot);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        effectService.disposeEffect(effect);

        expect(theFieldSaysSomethingIsListening(ghostSlot)).toBe(true);
        expect(ghostSlot.effects?.length).toBe(0);
        expect(somethingIsListening(ghostSlot)).toBe(false);
        // And the answer the engine acted on was the length.
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    // THE SAME MOMENT ON A BUCKET, released by the same
    // `OIMSlotOwnerService.releaseSlotIfUnheld` over the emptiness the bucket injects.
    it('lets a bucket go once its last effect leaves, with the empty list still on it', () => {
        const { db, effectService } = createFixture();
        const byTitleService = createOIMBucketService<
            TOIMEntitySlot<TCard>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>() });
        const byTitle = byTitleService.createStoreSlot(db);
        const spadesSlot = byTitleService.holdSlotByKey(byTitle, 'spades');
        const effect = effectService.createEffect(db, [spadesSlot], [], () => { /* held */ });
        spadesSlot.owner.unholdSlot(spadesSlot);
        expect(byTitleService.getSlotCount(byTitle)).toBe(1);

        effectService.disposeEffect(effect);

        expect(theFieldSaysSomethingIsListening(spadesSlot)).toBe(true);
        expect(spadesSlot.effects?.length).toBe(0);
        expect(somethingIsListening(spadesSlot)).toBe(false);
        expect(byTitleService.getSlotCount(byTitle)).toBe(0);
    });

    it('answers the question and the count from one list', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        // Held throughout, so the give-back inside each `dispose` declines and
        // the identity survives to be asked about after the last one.
        const ghostSlot = cardsService.holdSlotByKey(cards, 'ghost');

        const first = effectService.createEffect(db, [ghostSlot], [], () => { /* held */ });
        const second = effectService.createEffect(db, [ghostSlot], [], () => { /* held */ });
        expect(ghostSlot.effects?.length).toBe(2);
        expect(somethingIsListening(ghostSlot)).toBe(true);

        effectService.disposeEffect(first);
        expect(ghostSlot.effects?.length).toBe(1);
        expect(somethingIsListening(ghostSlot)).toBe(true);

        effectService.disposeEffect(second);
        expect(ghostSlot.effects?.length).toBe(0);
        expect(somethingIsListening(ghostSlot)).toBe(false);

        ghostSlot.owner.unholdSlot(ghostSlot);
    });
});
