// Prose: ./README.md#groupingoneorderoption
// Keep the two blocks above the last marker identical to `groupingOne.ts`.
// `OIMSlotContentPositionalArrayBucketService` is REFERENCED and never constructed: retention is decided by a
// live symbol naming the class, not by the `new` running.
import { OIMDB, OIMEffectService, OIMSlotMapStoreService } from '../../../../core/src/index';
import type { TOIMBucketSlot, TOIMColumnSlot, TOIMStoreKey } from '../../../../core/src/index';
import { OIMSlotContentSetBucketService } from '../../../../core/src/index';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot } from '../../../../core/src/index';
import { OIMSlotContentPositionalArrayBucketService } from '../../../../core/src/index';
import { createOIMSlotContentEntityService } from '../../../../core/src/index';
import { createOIMSlotCollectionService } from '../../../../core/src/index';

type TCard = { id: string; deckId: string; rank: number; title: string };

type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

export const held: unknown[] = [];

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const entityService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
const entityStoreSlot = entityService.createStoreSlot(db);

// `writeSlotContentByKey` mints and hands the slot back; a getter never mints.
const ace = entityService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', deckId: 'spades', rank: 1, title: 'ace' });
db.flush();

held.push(effectService.createEffect(db, () => { held.push(ace.entity); }, [ace]));

entityService.slotContentService.updateEntity(ace, { title: 'ACE' });
db.flush();

held.push(db, entityService, entityStoreSlot);

/* ── one index, addressed by key, filled, subscribed and read ──────────── */

const bucketService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TCardSlot>(), slotStoreService: new OIMSlotMapStoreService<TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TOIMStoreKey>, TOIMStoreKey>(), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
const bucketStoreSlot = bucketService.createStoreSlot(db);
// `holdSlotByKey` is the door and the hold is KEPT: a bucket nothing holds is unfiled
// the moment it empties, and this program is subscribed to the object.
bucketService.holdSlotByKey(bucketStoreSlot, 'spades');
const spadesSlot = bucketService.getSlotByKey(bucketStoreSlot, 'spades');
bucketService.slotContentService.writeSlotContent(spadesSlot, [ace]);

held.push(effectService.createEffect(db, () => {
    for (const slot of bucketService.slotContentService.getBucketMemberSlots(spadesSlot)) held.push(slot.entity);
    held.push(bucketService.slotContentService.getBucketMemberSlotCount(spadesSlot));
}, [spadesSlot]));

held.push(bucketService, bucketStoreSlot, spadesSlot);

/* ── and the branch of the ternary this caller never takes ─────────────── */

held.push(OIMSlotContentPositionalArrayBucketService);
