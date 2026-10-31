// Prose: ./withoutOrderedList.md
// CHANGE THIS PROGRAM AND CHANGE `withOrderedList.ts` IN THE SAME EDIT: the moment the two
// differ in anything but the ordered list, `ordered-list-diff` is not what its caveat says.
import { OIMDB, OIMEffectService, OIMSlotMapStoreService } from '../../../../core/src/index';
import type { TOIMBucketSlot, TOIMColumnSlot, TOIMStoreKey } from '../../../../core/src/index';
import { OIMSetBucketContentService } from '../../../../core/src/index';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot } from '../../../../core/src/index';
import { createOIMEntityContentService } from '../../../../core/src/index';
import { createOIMSlotCollectionService } from '../../../../core/src/index';

type TCard = { id: string; deckId: string; rank: number; title: string };

type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

export const held: unknown[] = [];

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const entityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>(), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
const entityStoreSlot = entityService.createStoreSlot(db);
const bucketService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TCardSlot>(), slotStoreService: new OIMSlotMapStoreService<TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TOIMStoreKey>, TOIMStoreKey>(), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
const bucketStoreSlot = bucketService.createStoreSlot(db);
bucketService.holdSlotByKey(bucketStoreSlot, 'spades');
const spadesSlot = bucketService.getSlotByKey(bucketStoreSlot, 'spades');
const ace = entityService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', deckId: 'spades', rank: 1, title: 'ace' });
db.flush();
bucketService.slotContentService.writeSlotContent(spadesSlot, [ace]);

held.push(effectService.createEffect(db, () => {
    for (const slot of bucketService.slotContentService.getBucketMemberSlots(spadesSlot)) held.push(slot.entity);
    held.push(bucketService.slotContentService.getBucketMemberSlotCount(spadesSlot));
}, [spadesSlot]));

entityService.slotContentService.updateEntity(ace, { title: 'ACE' });
db.flush();

held.push(db, entityService, entityStoreSlot, bucketService, bucketStoreSlot, spadesSlot);
