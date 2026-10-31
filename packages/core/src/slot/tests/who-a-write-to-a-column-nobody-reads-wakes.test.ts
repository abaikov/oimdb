import { OIMSlotContentChangeListenerService, OIMDB } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; deck: string; note: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const calls: string[] = [];
    OIMSlotContentChangeListenerService.INSTANCE.addContentChangeListener(cards, {
        onContentChanged: entitySlot => { calls.push(String(entitySlot.key)); },
        onManyContentsChanged: entitySlotChannelQueue => {
            for (let i = 0; i < entitySlotChannelQueue.getEntryCount(); i++) calls.push(String(entitySlotChannelQueue.getEntryAt(i).key));
        },
    }, ['deck']);
    const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'd1', note: 'a' });
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

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'd1', note: 'c' });

        expect(calls).toEqual([]);
    });

    it('calls no listener for such writes in a many-entity door either', () => {
        const { cardsService, cards, calls } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'd1', note: 'a' });
        calls.length = 0;

        cardsService.writeInBatch(cards, () => ([{ id: 'c1', deck: 'd1', note: 'x' }, { id: 'c2', deck: 'd1', note: 'y' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));

        expect(calls).toEqual([]);
    });

    it('still calls it when the column it reads moves', () => {
        const { cardsService, card, calls } = createFixture();

        cardsService.slotContentService.updateEntity(card, { deck: 'd2' });

        expect(calls).toEqual(['c1']);
    });

    it('still calls it for a write that fills or clears an entity, which names no columns', () => {
        const { cardsService, cards, calls } = createFixture();

        const filled = cardsService.writeSlotContentByKey(cards, 'c9', { id: 'c9', deck: 'd1', note: 'a' });
        cardsService.slotContentService.clearSlotContent(filled);

        expect(calls).toEqual(['c9', 'c9']);
    });
});
