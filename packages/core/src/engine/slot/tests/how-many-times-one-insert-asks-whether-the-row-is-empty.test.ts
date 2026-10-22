import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { IOIMSlotEmptiness } from '../interfaces/IOIMSlotEmptiness';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const makeCountingEmptiness = (): IOIMSlotEmptiness<TCardSlot> & { asked: number } => {
    const emptiness = {
        asked: 0,
        isEmpty: (slot: TCardSlot): boolean => {
            emptiness.asked++;
            return slot.entity === undefined;
        },
    };
    return emptiness;
};

const createFixture = () => {
    const db = new OIMDB();
    const emptiness = makeCountingEmptiness();
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotEmptiness: emptiness,
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, emptiness };
};

describe('how many times one insert asks whether the row is empty', () => {
    it('asks once for a row written under a key nothing held', () => {
        const { cardsService, cards, emptiness } = createFixture();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'A' });

        expect(emptiness.asked).toBe(1);
    });

    it('asks nothing for a re-send, which is a write that landed no column', () => {
        const { cardsService, cards, emptiness } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'A' });
        const afterInsert = emptiness.asked;

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'A' });

        expect(emptiness.asked - afterInsert).toBe(0);
        expect(cardsService.slotContentService.findEntityByKey(cards, 'c1')).toEqual({ id: 'c1', title: 'A' });
    });

    it('asks once per row across a batch, so the count is the population', () => {
        const { cardsService, cards, emptiness } = createFixture();

        for (let i = 0; i < 100; i++) cardsService.slotContentService.upsertEntity(cards, { id: `c${i}`, title: 'A' });

        expect(emptiness.asked).toBe(100);
    });

    it('asks once more for a write that lands on a row already there', () => {
        const { db, cardsService, cards, emptiness } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'A' });
        db.flush();
        emptiness.asked = 0;

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'B' });

        expect(emptiness.asked).toBe(1);
    });

    it('asks nothing of a read that mints no value', () => {
        const { cardsService, cards, emptiness } = createFixture();

        cardsService.hasSlotContentByKey(cards, 'c1');

        expect(emptiness.asked).toBe(0);
    });
});
