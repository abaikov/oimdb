// Prose: ./README.md#fieldfloor
// `field-floor` and `field-lifted` are THIS module bundled twice; what differs is the engine
// underneath, with `fieldMachineryExcision.ts` applied in memory.
import {
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceMapDriven,
    createOIMBucketService,
    createOIMEntityService,
} from '../../../../core/src/index';
import type { TOIMBucketSlotsSetStore, TOIMColumnSlot, TOIMEntitySlot, TOIMStoreKey } from '../../../../core/src/index';

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

const c1 = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c1', deckId: 'spades', rank: 1, title: 'ace' });
const c2 = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c2', deckId: 'spades', rank: 2, title: 'two' });
db.flush();

/* ── a bucket the caller fills, and a read of it ────────────────────────── */

bucketService.holdSlotByKey(bucketStoreSlot, 'spades');

const spadesSlot = bucketService.getSlotByKey(bucketStoreSlot, 'spades');
bucketService.slotContentService.writeBucketMemberSlots(spadesSlot, [c1, c2]);

held.push(effectService.createEffect(db, [spadesSlot], [], () => {
    for (const slot of bucketService.slotContentService.getBucketMemberSlots(spadesSlot)) held.push(slot.entity);
    held.push(bucketService.slotContentService.getBucketMemberSlotCount(spadesSlot));
}));

/* ── one row, watched whole — never by column ───────────────────────────── */

// `effectService.createEffect` over the SLOT — the whole-row signal, never
// over a column slot, which is the narrower door this arm exists to
// decline. No column identity is ever minted for any row here.
held.push(effectService.createEffect(db, [c1], [], () => { held.push(c1.entity); }));

entityService.slotContentService.updateEntity(c1, { title: 'ACE' });
db.flush();

held.push(db,entityService, entityStoreSlot, bucketService, bucketStoreSlot, spadesSlot);
