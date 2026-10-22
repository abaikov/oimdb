import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const deckService = createOIMBucketService(db, {
        slotContentService: new OIMSlotContentBucketServiceArrayDriven<TCardSlot>(),
    });
    const deck = deckService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'first' });
    db.flush();
    return { db, cardsService, cards, deckService, deck, a: cardsService.getSlotByKey(cards, 'a') };
};

describe('a bucket change made while the batch is still open', () => {
    it('cannot be flushed half-way, and is delivered once the batch closes', () => {
        const { db, cardsService, cards, deckService, deck, a } = createFixture();
        const bucket = deckService.holdSlotByKey(deck, 'deck');
        let wokeForTheBucket = 0;
        OIMEffectService.INSTANCE.createEffect(db, [bucket], [], () => { wokeForTheBucket++; });
        db.flush();
        wokeForTheBucket = 0;

        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        deckService.slotContentService.addBucketMemberSlots(bucket, [a]);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'second' });
        expect(() => { db.flush(); }).toThrow('a subframe is open');
        expect(wokeForTheBucket).toBe(0);

        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
        db.flush();

        expect(wokeForTheBucket).toBe(1);
        expect(deckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(1);
    });
});
