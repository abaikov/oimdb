import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../../factories/createOIMSlotCollectionIndexService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';
import { OIMSlotContentPositionalArrayBucketService } from '../../bucket/OIMSlotContentPositionalArrayBucketService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { OIMSlotMapStoreService } from '../../../engine/store/OIMSlotMapStoreService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };

describe('an index factory', () => {
    it('records commands on an array-driven index when it is handed bucket commands', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot<TCard>, string>({
                bucketCommands: new OIMBucketCommands({}),
            }),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        db.flush();
        let seenCommandCount = -1;
        OIMEffectService.INSTANCE.createEffect(db, [spades], [], () => { seenCommandCount = spades.commands?.length ?? 0; });

        cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades' });
        db.flush();

        expect(seenCommandCount).toBe(1);
    });

    it('files its buckets in the bucket slot store service it is handed', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const bucketSlotStoreService = new OIMSlotMapStoreService<
            TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>, string>, string
        >();
        const createStore = jest.spyOn(bucketSlotStoreService, 'createStore');
        createOIMSlotCollectionIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>, string>(),
            bucketSlotStoreService,
        }).createIndexStoreSlot(cards);

        expect(createStore).toHaveBeenCalledTimes(1);
    });
});
