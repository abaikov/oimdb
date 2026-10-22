// Keep the block above the marker identical to `groupingNone.ts`.
// The names below are PUSHED, not called: retention is decided by a live symbol. The map store
// is not pushed and is not missing — the shared block above already names it.
import {
    OIMDB,
    OIMEffectService,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
} from '../../../../core/src/index';
import type { TOIMColumnSlot } from '../../../../core/src/index';
import {
    OIMIndexService,
    OIMSlotStoreServiceTreeDriven,
    createOIMBucketService,
} from '../../../../core/src/index';

type TCard = { id: string; deckId: string; rank: number; title: string };

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


/* ── what a population's own method bodies would have carried; the bucket facade is pinned
      through the factory `createOIMBucketService`, as the `OIMBucketService` class is gone ── */

held.push(
    OIMSlotStoreServiceTreeDriven,
    createOIMBucketService,
    OIMIndexService,
);
