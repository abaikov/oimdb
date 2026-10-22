import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';
import { OIMSlotContentBucketServiceArrayDriven } from '../../bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotStoreServiceMapDriven } from '../../../engine/store/OIMSlotStoreServiceMapDriven';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deck: string };

describe('an index factory', () => {
    it('records commands on an array-driven index when it is handed bucket commands', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TCard>>({
                bucketCommands: new OIMBucketCommands({}),
            }),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        db.flush();
        let seenCommandCount = -1;
        OIMEffectService.INSTANCE.createEffect(db, [spades], [], () => { seenCommandCount = spades.commands?.length ?? 0; });

        cardsService.slotContentService.upsertEntity(cards, { id: 'ace', deck: 'spades' });
        db.flush();

        expect(seenCommandCount).toBe(1);
    });

    it('files its buckets in the bucket slot store service it is handed', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const bucketSlotStoreService = new OIMSlotStoreServiceMapDriven<
            TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>, string>, string
        >();
        const createStore = jest.spyOn(bucketSlotStoreService, 'createStore');
        createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
            bucketSlotStoreService,
        }).createIndexStoreSlot(cards);

        expect(createStore).toHaveBeenCalledTimes(1);
    });
});
