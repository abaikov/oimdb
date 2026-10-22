// Prose: ./withoutOrderedList.md
// CHANGE THIS PROGRAM AND CHANGE `withOrderedList.ts` IN THE SAME EDIT: the moment the two
// differ in anything but the ordered list, `ordered-list-diff` is not what its caveat says.
import {
    OIMDB,
    OIMEffectService,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
} from '../../../../core/src/index';
import type { TOIMColumnSlot, TOIMStoreKey } from '../../../../core/src/index';
import {
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
} from '../../../../core/src/index';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot } from '../../../../core/src/index';

type TCard = { id: string; deckId: string; rank: number; title: string };

type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

export const held: unknown[] = [];

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const entityService = createOIMEntityService<TCard>(db, {
    keyOf: card => card.id,
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
});
const entityStoreSlot = entityService.createStoreSlot(db);
const bucketService = createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, {
    bucketSlotStoreService: new OIMSlotStoreServiceMapDriven(),
    slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
});
const bucketStoreSlot = bucketService.createStoreSlot(db);
bucketService.holdSlotByKey(bucketStoreSlot, 'spades');
const spadesSlot = bucketService.getSlotByKey(bucketStoreSlot, 'spades');
const ace = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c1', deckId: 'spades', rank: 1, title: 'ace' });
db.flush();
bucketService.slotContentService.writeBucketMemberSlots(spadesSlot, [ace]);

held.push(effectService.createEffect(db, [spadesSlot], [], () => {
    for (const slot of bucketService.slotContentService.getBucketMemberSlots(spadesSlot)) held.push(slot.entity);
    held.push(bucketService.slotContentService.getBucketMemberSlotCount(spadesSlot));
}));

entityService.slotContentService.updateEntity(ace, { title: 'ACE' });
db.flush();

held.push(db, entityService, entityStoreSlot, bucketService, bucketStoreSlot, spadesSlot);
