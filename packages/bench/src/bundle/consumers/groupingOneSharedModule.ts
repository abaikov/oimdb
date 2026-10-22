// Keep the two blocks above the last marker identical to `groupingOne.ts`.
// The other store is PUSHED rather than routed through a shared resolver, so this arm is an
// UPPER BOUND; the set of MODULES is not over-stated.
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
import { OIMSlotStoreServiceTreeDriven } from '../../../../core/src/index';

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

// `upsertEntity` mints and hands the slot back; a getter never mints.
const ace = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c1', deckId: 'spades', rank: 1, title: 'ace' });
db.flush();

held.push(effectService.createEffect(db, [ace], [], () => { held.push(ace.entity); }));

entityService.slotContentService.updateEntity(ace, { title: 'ACE' });
db.flush();

held.push(db, entityService, entityStoreSlot);

/* ── one index, addressed by key, filled, subscribed and read ──────────── */

const bucketService = createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, {
    bucketSlotStoreService: new OIMSlotStoreServiceMapDriven(),
    slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
});
const bucketStoreSlot = bucketService.createStoreSlot(db);
// `holdSlotByKey` is the door and the hold is KEPT: a bucket nothing holds is unfiled
// the moment it empties, and this program is subscribed to the object.
bucketService.holdSlotByKey(bucketStoreSlot, 'spades');
const spadesSlot = bucketService.getSlotByKey(bucketStoreSlot, 'spades');
bucketService.slotContentService.writeBucketMemberSlots(spadesSlot, [ace]);

held.push(effectService.createEffect(db, [spadesSlot], [], () => {
    for (const slot of bucketService.slotContentService.getBucketMemberSlots(spadesSlot)) held.push(slot.entity);
    held.push(bucketService.slotContentService.getBucketMemberSlotCount(spadesSlot));
}));

held.push(bucketService, bucketStoreSlot, spadesSlot);


/* ── and the other identity store a shared resolver could not have withheld ─ */

held.push(OIMSlotStoreServiceTreeDriven);
