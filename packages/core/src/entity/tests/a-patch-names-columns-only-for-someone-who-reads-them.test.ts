import { OIMDB, OIMEffectService, OIMSlotContentSetBucketService, createOIMInPlaceEntityWriter, createOIMReplacingEntityWriter, createOIMSlotCollectionIndexService } from '../../index';
import type { IOIMEntityWriter, TOIMEntitySlot } from '../../index';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; title: string; rank: number };

const watchingWriter = (inner: IOIMEntityWriter) => {
    const namesHanded: (string[] | undefined)[] = [];
    const entityWriter: IOIMEntityWriter = {
        ...inner,
        patchEntity: (slot, patch, changedColumnNames) => {
            namesHanded.push(changedColumnNames);
            return inner.patchEntity(slot, patch, changedColumnNames);
        },
    };
    return { entityWriter, namesHanded };
};

describe('a patch names its columns only for someone who reads them', () => {
    it.each([
        ['in place', createOIMInPlaceEntityWriter()],
        ['replacing', createOIMReplacingEntityWriter()],
    ])('the %s writer answers whether anything changed, and names nothing when handed no list', (_arm, writer) => {
        const db = new OIMDB({ entityWriter: writer });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'x', title: 'ace', rank: 1 }) as TOIMEntitySlot;

        expect(writer.patchEntity(card, { title: 'two', rank: 1 }, undefined)).toBe(true);
        expect(writer.patchEntity(card, { title: 'two' }, undefined)).toBe(false);
        const named: string[] = [];
        expect(writer.patchEntity(card, { title: 'three', rank: 2, deck: 'x' }, named)).toBe(true);
        expect(named).toEqual(['title', 'rank']);
        expect(card.entity).toEqual({ id: 'a', deck: 'x', title: 'three', rank: 2 });
    });

    it('hands the writer no list when nothing watches the slot by column and nothing listens to the collection', () => {
        const { entityWriter, namesHanded } = watchingWriter(createOIMInPlaceEntityWriter());
        const db = new OIMDB({ entityWriter });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'x', title: 'ace', rank: 1 });

        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { title: 'two' });

        expect(namesHanded).toEqual([undefined]);
    });

    it('hands it a list once a column of the slot is watched', () => {
        const { entityWriter, namesHanded } = watchingWriter(createOIMInPlaceEntityWriter());
        const db = new OIMDB({ entityWriter });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'x', title: 'ace', rank: 1 });
        const title = cardsService.columnSlotService.holdColumn(card, 'title');
        let woke = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { woke++; }, [title]);
        db.flush();
        woke = 0;

        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { title: 'two', rank: 1 });
        db.flush();

        expect(namesHanded).toEqual([['title']]);
        expect(woke).toBe(1);
    });

    it('hands it a list while an index listens to the collection', () => {
        const { entityWriter, namesHanded } = watchingWriter(createOIMInPlaceEntityWriter());
        const db = new OIMDB({ entityWriter });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>>(),
        });
        byDeckService.createIndexStoreSlot(cards);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'x', title: 'ace', rank: 1 });

        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { deck: 'y' });

        expect(namesHanded).toEqual([['deck']]);
    });
});
