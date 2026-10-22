import { OIMContentChangeListenerService, OIMDB, createOIMEntityService } from '../../../index';

type TCard = { id: string; deck: string; note: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const calls: string[] = [];
    OIMContentChangeListenerService.INSTANCE.addContentChangeListener(cards, {
        onContentChanged: entitySlot => { calls.push(String(entitySlot.key)); },
        onContentChangedMany: entitySlotChannelQueue => {
            for (let i = 0; i < entitySlotChannelQueue.getEntryCount(); i++) calls.push(String(entitySlotChannelQueue.getEntryAt(i).key));
        },
    }, ['deck']);
    const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'd1', note: 'a' });
    calls.length = 0;
    return { db, cardsService, cards, card, calls };
};

describe('a write to a column no listener reads', () => {
    it('calls no listener on a patch', () => {
        const { cardsService, card, calls } = createFixture();

        cardsService.slotContentService.updateEntity(card, { note: 'b' });

        expect(calls).toEqual([]);
    });

    it('calls no listener on a whole-entity put that moves only that column', () => {
        const { cardsService, cards, calls } = createFixture();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'd1', note: 'c' });

        expect(calls).toEqual([]);
    });

    it('calls no listener for such writes in a many-entity door either', () => {
        const { cardsService, cards, calls } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'd1', note: 'a' });
        calls.length = 0;

        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deck: 'd1', note: 'x' }, { id: 'c2', deck: 'd1', note: 'y' }]);

        expect(calls).toEqual([]);
    });

    it('still calls it when the column it reads moves', () => {
        const { cardsService, card, calls } = createFixture();

        cardsService.slotContentService.updateEntity(card, { deck: 'd2' });

        expect(calls).toEqual(['c1']);
    });

    it('still calls it for a write that fills or clears an entity, which names no columns', () => {
        const { cardsService, cards, calls } = createFixture();

        const filled = cardsService.slotContentService.upsertEntity(cards, { id: 'c9', deck: 'd1', note: 'a' });
        cardsService.slotContentService.deleteEntity(filled);

        expect(calls).toEqual(['c9', 'c9']);
    });
});
