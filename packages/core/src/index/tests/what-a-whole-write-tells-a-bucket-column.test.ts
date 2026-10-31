import { OIMDefaults } from '../../index';
import { OIMDB, OIMEffectService, createOIMInPlaceEntityWriter, createOIMSlotCollectionIndexService } from '../../index';
import type { IOIMEntityWriter, TOIMEntityColumnName, TOIMEntitySlot, TOIMStoreKey } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; rank?: number | undefined; title: string };

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService<
        TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>
    >({ entityService: cardsService, keyOf: (card: TCard) => card.deck });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'd', rank: 1, title: 't' });
    const rank = byDeckService.holdBucketColumnByKey(byDeck, 'd', 'rank');
    let woke = 0;
    effectService.createEffect(db, () => { woke++; }, [rank]);
    db.flush();
    return { db, cardsService, cards, woke: (): number => { const was = woke; woke = 0; return was; } };
};

describe('what a whole write tells a bucket column', () => {
    it('wakes the column when the whole write drops it', () => {
        const { db, cardsService, cards, woke } = createFixture();
        woke();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'd', title: 't' });
        db.flush();
        expect(woke()).toBe(1);
    });

    it('wakes the column when the whole write sets it to undefined', () => {
        const { db, cardsService, cards, woke } = createFixture();
        woke();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'd', rank: undefined, title: 't' });
        db.flush();
        expect(woke()).toBe(1);
    });

    it('does not wake the column when the whole write changed only another one', () => {
        const { db, cardsService, cards, woke } = createFixture();
        woke();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'd', rank: 1, title: 'changed' });
        db.flush();
        expect(woke()).toBe(0);
    });

    it('hands the writer no list when nothing reads the changed columns', () => {
        const inPlace = createOIMInPlaceEntityWriter();
        const namesHanded: (string[] | undefined)[] = [];
        const entityWriter: IOIMEntityWriter = {
            ...inPlace,
            putEntity: (slot, entity, changedColumnNames) => {
                namesHanded.push(changedColumnNames);
                return inPlace.putEntity(slot, entity, changedColumnNames);
            },
        };
        const defaults = new OIMDefaults({ entityWriter });
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMSlotContentEntityService<TCard>({ defaults }) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'd', rank: 1, title: 't' });

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'd', title: 'changed' });

        expect(namesHanded).toEqual([undefined]);
    });
});
