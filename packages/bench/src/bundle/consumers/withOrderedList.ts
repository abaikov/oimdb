// Prose: ./README.md#withorderedlist
// Keep this file and `withoutOrderedList.ts` identical apart from the ordered list.
// The difference contains the diff module AND the call site below; the call site is NOT
// subtracted, because the comparison is between two applications, not two module graphs.
// `held` is exported because an entry point's exports are the one thing tree-shaking may not remove.
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
import { oimOrderedListCommandsOfTransition } from '../../../../core/src/index';

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


/* ── and the ordered-list diff, which is the whole of this arm ────────── */

const shown: TOIMEntitySlot[] = [];
held.push(effectService.createEffect(db, [spadesSlot], [], () => {
    const next = [...bucketService.slotContentService.getBucketMemberSlots(spadesSlot)];
    held.push(oimOrderedListCommandsOfTransition(shown, next));
    shown.length = 0;
    for (let i = 0; i < next.length; i++) shown.push(next[i]);
}));
