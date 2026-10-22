import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceSetDriven, createOIMEntityService, createOIMEntityWriterInPlace,
    createOIMEntityWriterReplacing, createOIMIndexService,
} from '../../../index';
import type { IOIMEntityWriter, TOIMEntitySlot } from '../../../index';

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
        ['in place', createOIMEntityWriterInPlace()],
        ['replacing', createOIMEntityWriterReplacing()],
    ])('the %s writer answers whether anything changed, and names nothing when handed no list', (_arm, writer) => {
        const db = new OIMDB({ entityWriter: writer });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards,{ id: 'a', deck: 'x', title: 'ace', rank: 1 }) as TOIMEntitySlot;

        expect(writer.patchEntity(card, { title: 'two', rank: 1 }, undefined)).toBe(true);
        expect(writer.patchEntity(card, { title: 'two' }, undefined)).toBe(false);
        const named: string[] = [];
        expect(writer.patchEntity(card, { title: 'three', rank: 2, deck: 'x' }, named)).toBe(true);
        expect(named).toEqual(['title', 'rank']);
        expect(card.entity).toEqual({ id: 'a', deck: 'x', title: 'three', rank: 2 });
    });

    it('hands the writer no list when nothing watches the slot by column and nothing listens to the collection', () => {
        const { entityWriter, namesHanded } = watchingWriter(createOIMEntityWriterInPlace());
        const db = new OIMDB({ entityWriter });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', deck: 'x', title: 'ace', rank: 1 });

        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { title: 'two' });

        expect(namesHanded).toEqual([undefined]);
    });

    it('hands it a list once a column of the slot is watched', () => {
        const { entityWriter, namesHanded } = watchingWriter(createOIMEntityWriterInPlace());
        const db = new OIMDB({ entityWriter });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards,{ id: 'a', deck: 'x', title: 'ace', rank: 1 });
        const title = cardsService.holdColumn(card, 'title');
        let woke = 0;
        OIMEffectService.INSTANCE.createEffect(db, [title], [], () => { woke++; });
        db.flush();
        woke = 0;

        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { title: 'two', rank: 1 });
        db.flush();

        expect(namesHanded).toEqual([['title']]);
        expect(woke).toBe(1);
    });

    it('hands it a list while an index listens to the collection', () => {
        const { entityWriter, namesHanded } = watchingWriter(createOIMEntityWriterInPlace());
        const db = new OIMDB({ entityWriter });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        byDeckService.createIndexStoreSlot(cards);
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', deck: 'x', title: 'ace', rank: 1 });

        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { deck: 'y' });

        expect(namesHanded).toEqual([['deck']]);
    });
});
