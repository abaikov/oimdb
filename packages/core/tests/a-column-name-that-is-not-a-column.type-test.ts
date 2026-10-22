import { OIMDB } from '../src/factories/OIMDB';
import { createOIMEntityService } from '../src/factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string; rank: number };

const db = new OIMDB();
const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
const cards = cardsService.createStoreSlot(db);
const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one', rank: 1 });

cardsService.slotContentService.markEntityChanged(card, ['title']);
cardsService.slotContentService.markEntityChanged(card, ['title', 'rank']);
cardsService.slotContentService.markEntityChanged(card);

// @ts-expect-error a name the entity does not carry is not a column of it
cardsService.slotContentService.markEntityChanged(card, ['titel']);

// @ts-expect-error a bare string is not known to be a column name
cardsService.slotContentService.markEntityChanged(card, [String(Math.round(1))]);

// @ts-expect-error a slot of another entity is not this collection's to mark
cardsService.slotContentService.markEntityChanged({} as TOIMEntitySlot<{ other: string }, string>, ['title']);
