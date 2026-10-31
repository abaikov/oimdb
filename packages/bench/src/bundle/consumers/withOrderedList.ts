// Prose: ./README.md#withorderedlist
// Keep this file and `withoutOrderedList.ts` identical apart from the ordered list.
// The difference contains the diff module AND the call site below; the call site is NOT
// subtracted, because the comparison is between two applications, not two module graphs.
// `held` is exported because an entry point's exports are the one thing tree-shaking may not remove.
import { OIMDB, OIMEffectService, OIMSlotMapStoreService } from '../../../../core/src/index';
import type { TOIMBucketSlot, TOIMColumnSlot, TOIMStoreKey } from '../../../../core/src/index';
import { OIMSlotContentSetBucketService } from '../../../../core/src/index';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot } from '../../../../core/src/index';
import { oimOrderedListCommandsOfTransition } from '../../../../core/src/index';
import { createOIMSlotContentEntityService } from '../../../../core/src/index';
import { createOIMSlotCollectionService } from '../../../../core/src/index';

type TCard = { id: string; deckId: string; rank: number; title: string };

type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

export const held: unknown[] = [];

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const entityService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>(), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
const entityStoreSlot = entityService.createStoreSlot(db);
const bucketService = createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TCardSlot>(), slotStoreService: new OIMSlotMapStoreService<TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TOIMStoreKey>, TOIMStoreKey>(), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
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


/* ── and the ordered-list diff, which is the whole of this arm ────────── */

const shown: TOIMEntitySlot[] = [];
held.push(effectService.createEffect(db, () => {
    const next = [...bucketService.slotContentService.getBucketMemberSlots(spadesSlot)];
    held.push(oimOrderedListCommandsOfTransition(shown, next));
    shown.length = 0;
    for (let i = 0; i < next.length; i++) shown.push(next[i]);
}, [spadesSlot]));
