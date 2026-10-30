import { OIMDB } from '../src/db/OIMDB';
import type { TOIMEntitySlot } from '../src/entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../src/entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../src/slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string; rank: number };

const db = new OIMDB();
const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
const cards = cardsService.createStoreSlot(db);
const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one', rank: 1 });

cardsService.slotContentService.markEntityChanged(card, ['title']);
cardsService.slotContentService.markEntityChanged(card, ['title', 'rank']);
cardsService.slotContentService.markEntityChanged(card);

// @ts-expect-error a name the entity does not carry is not a column of it
cardsService.slotContentService.markEntityChanged(card, ['titel']);

// @ts-expect-error a bare string is not known to be a column name
cardsService.slotContentService.markEntityChanged(card, [String(Math.round(1))]);

// @ts-expect-error a slot of another entity is not this collection's to mark
cardsService.slotContentService.markEntityChanged({} as TOIMEntitySlot<{ other: string }, string>, ['title']);
