// Prose: ./groupingNone.md
// The five grouping arms are ONE program written five times: every difference between any two
// of their bundles must be the block appended at the bottom. Change one, change all five.
import { OIMDB, OIMEffectService, OIMSlotMapStoreService } from '../../../../core/src/index';
import type { TOIMColumnSlot } from '../../../../core/src/index';
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
