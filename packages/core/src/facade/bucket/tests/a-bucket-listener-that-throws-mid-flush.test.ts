import {
    OIMChannelService, OIMContentChangeListenerService, OIMDB, OIMEffectService, OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService, createOIMEntityService,
} from '../../../index';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;

describe('a bucket listener that throws in the middle of a flush of changed buckets', () => {
    it('throws from the door whose first change it hears, and leaves every other bucket of the subframe stamped', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createOIMBucketService<
            TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
        const decksContentService = decksService.slotContentService;
        const decks = decksService.createStoreSlot(db);
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(decks, {
            onContentChanged: bucketSlot => { if (bucketSlot.key === 'a') throw new Error('the listener threw'); },
            onContentChangedMany: () => undefined,
        }, undefined);
        const a = decksService.holdSlotByKey(decks, 'a');
        const b = decksService.holdSlotByKey(decks, 'b');
        let runsOnB = 0;
        effectService.createEffect(db, [b], [], () => { runsOnB++; });
        db.flush();
        runsOnB = 0;

        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        expect(() => { decksContentService.addBucketMemberSlots(a, [cardsService.slotContentService.upsertEntity(cards, { id: '1' })]); }).toThrow('the listener threw');
        decksContentService.addBucketMemberSlots(b, [cardsService.slotContentService.upsertEntity(cards, { id: '2' })]);
        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
        db.flush();

        expect(runsOnB).toBe(1);
    });
});
