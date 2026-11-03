import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';
import { OIMPositionalArrayBucketContentService } from '../../bucket/OIMPositionalArrayBucketContentService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMSlotMapStoreService } from '../../store/OIMSlotMapStoreService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };

describe('an index factory', () => {
    it('records commands on an array-driven index when it is handed bucket commands', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            selectKey: (card: TCard) => card.deck,
            slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TCard>, string>({
                bucketCommands: new OIMBucketCommands({}),
            }),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        db.flush();
        let seenCommandCount = -1;
        OIMEffectService.INSTANCE.createEffect(db, () => { seenCommandCount = spades.commands?.length ?? 0; }, [spades]);

        cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades' });
        db.flush();

        expect(seenCommandCount).toBe(1);
    });

    it('files its buckets in the bucket slot store service it is handed', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const bucketSlotStoreService = new OIMSlotMapStoreService<
            TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>, string>, string
        >();
        const createStore = jest.spyOn(bucketSlotStoreService, 'createStore');
        createOIMSlotCollectionIndexService({
            entityService: cardsService,
            selectKey: (card: TCard) => card.deck,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>, string>(),
            bucketSlotStoreService,
        }).createIndexStoreSlot(cards);

        expect(createStore).toHaveBeenCalledTimes(1);
    });
});
