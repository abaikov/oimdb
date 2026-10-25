import { OIMSlotContentSetBucketService } from '../OIMSlotContentSetBucketService';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type Card = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<Card, TOIMStoreKey>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card>(db) });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });
    const byDeck = byDeckService.createStoreSlot(db);
    return { db, cardsService, cards, byDeckService, byDeck };
};

describe('an emptied bucket says so', () => {
    it('wakes a subscriber when the bucket is removed through the store', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = createFixture();
        const a = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A' });
        const deck = byDeckService.getSlotByKey(byDeck, 'd1');
        byDeckService.slotContentService.writeSlotContent(deck, [a]);
        db.flush();

        let runCount = 0;
        const watching = OIMEffectService.INSTANCE.createEffect(db, [deck], [], () => { runCount++; });
        db.flush();
        const before = runCount;

        // THE DOOR UNDER TEST. Before the repair this emptied the bucket and
        // reported nothing, so `runCount` stayed at `before` through the flush.
        byDeckService.slotContentService.clearSlotContent(deck);
        db.flush();

        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(0);
        expect(runCount).toBe(before + 1);
        OIMEffectService.INSTANCE.disposeEffect(watching);
    });

    it('gives every hold back, which is what it already did', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = createFixture();
        const a = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A' });
        const b = cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', title: 'B' });
        const deck = byDeckService.getSlotByKey(byDeck, 'd1');
        byDeckService.slotContentService.writeSlotContent(deck, [a, b]);
        db.flush();
        expect(a.holdCount).toBe(1);
        expect(b.holdCount).toBe(1);

        byDeckService.slotContentService.clearSlotContent(deck);
        db.flush();

        expect(a.holdCount).toBe(0);
        expect(b.holdCount).toBe(0);
    });

    it('says nothing when the bucket was already empty', () => {
        const { db, byDeckService, byDeck } = createFixture();
        const deck = byDeckService.getSlotByKey(byDeck, 'd1');
        byDeckService.slotContentService.writeSlotContent(deck, []);

        let runCount = 0;
        const watching = OIMEffectService.INSTANCE.createEffect(db, [deck], [], () => { runCount++; });
        db.flush();
        const before = runCount;

        byDeckService.slotContentService.clearSlotContent(deck);
        db.flush();

        expect(runCount).toBe(before);
        OIMEffectService.INSTANCE.disposeEffect(watching);
    });
});
