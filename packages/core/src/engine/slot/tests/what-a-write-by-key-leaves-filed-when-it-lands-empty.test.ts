import { OIMDB } from '../../../factories/OIMDB';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; title: string };

const createFixture =() => {
    const db = new OIMDB();
    const byDeckService = createOIMBucketService<
        TOIMEntitySlot<TCard, TOIMStoreKey>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard, TOIMStoreKey>>,
        OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>() });
    const byDeck = byDeckService.createStoreSlot(db);
    return { db, byDeck, byDeckService };
};

describe('a write addressed by key, when what it writes lands empty', () => {
    it('and the slot door reaches the same state from the same content', () => {
        const { byDeck, byDeckService } = createFixture();
        const throughTheSlotDoor = byDeckService.holdSlotByKey(byDeck, 'deck');

        byDeckService.slotContentService.writeBucketMemberSlots(throughTheSlotDoor, []);
        throughTheSlotDoor.owner.unholdSlot(throughTheSlotDoor);

        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });
});
