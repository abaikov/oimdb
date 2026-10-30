// Keep the block above the marker identical to `groupingNone.ts`.
// The names below are PUSHED, not called: retention is decided by a live symbol. The map store
// is not pushed and is not missing — the shared block above already names it.
import { OIMDB, OIMEffectService, OIMSlotMapStoreService } from '../../../../core/src/index';
import type { TOIMColumnSlot } from '../../../../core/src/index';
import { OIMSlotCollectionIndexService, OIMSlotTreeStoreService } from '../../../../core/src/index';
import { createOIMSlotContentEntityService } from '../../../../core/src/index';
import { createOIMSlotCollectionService } from '../../../../core/src/index';

type TCard = { id: string; deckId: string; rank: number; title: string };

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


/* ── what a population's own method bodies would have carried; the bucket facade is pinned
      through the factory `createOIMSlotCollectionService` ── */

held.push(
    OIMSlotTreeStoreService,
    createOIMSlotCollectionService,
    OIMSlotCollectionIndexService,
);
