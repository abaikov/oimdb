import { OIMDB } from '../../../factories/OIMDB';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; deck: string; title: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;
type TCardsService = ReturnType<typeof createOIMEntityService<TCard>>;
type TCardsStore = Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>;

const createCards = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'ace', rank: 1 });
    cardsService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'spades', title: 'two', rank: 2 });
    db.flush();
    return { db, cards, cardsService };
};

const setDrivenByColumn = (db: OIMDB, cardsService: TCardsService) => createOIMIndexService<
    TCard, TOIMStoreKey, readonly ['deck'], string, TCardsStore, TOIMBucketSlotsSetStore<TCardSlot>,
    OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, {
    entityService: cardsService,
    slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    columns: ['deck'],
});

const updateByKey = (cardsService: TCardsService, cards: Parameters<TCardsService['findSlotByKey']>[0], key: string, patch: Partial<TCard>): void => {
    const slot = cardsService.findSlotByKey(cards, key);
    if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
};

describe('what an index reads its key from', () => {
    it('files by the column it was given, with no key function', () => {
        const { db, cards, cardsService } = createCards();
        const byDeckService = setDrivenByColumn(db, cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const clubs = byDeckService.holdSlotByKey(byDeck, 'clubs');
        updateByKey(cardsService, cards, 'c1', { deck: 'clubs' });
        db.flush();
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(spades)).toBe(1);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(clubs)).toBe(1);
    });

    it('does not ask its key function about a write that changed none of its columns', () => {
        const { db, cards, cardsService } = createCards();
        let keyOfCalls = 0;
        const byDeckService = createOIMIndexService<
            TCard, TOIMStoreKey, readonly ['deck'], string, TCardsStore
        >(db, {
            entityService: cardsService,
            columns: ['deck'],
            keyOf: card => {
                keyOfCalls++;
                return card.deck;
            },
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        db.flush();
        const callsBeforeWrites = keyOfCalls;
        updateByKey(cardsService, cards, 'c1', { title: 'king' });
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c2', deck: 'spades', title: 'queen', rank: 2 }]);
        expect(keyOfCalls).toBe(callsBeforeWrites);
        updateByKey(cardsService, cards, 'c1', { deck: 'clubs' });
        expect(keyOfCalls).toBe(callsBeforeWrites + 1);
    });

    it('asks its key function about every write when it names no columns', () => {
        const { db, cards, cardsService } = createCards();
        let keyOfCalls = 0;
        const byDeckService = createOIMIndexService<
            TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string, TCardsStore,
            TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
        >(db, {
            entityService: cardsService,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
            keyOf: card => {
                keyOfCalls++;
                return card.deck;
            },
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        db.flush();
        const callsBeforeWrite = keyOfCalls;
        updateByKey(cardsService, cards, 'c1', { title: 'king' });
        expect(keyOfCalls).toBe(callsBeforeWrite + 1);
    });

    it('still wakes a bucket column slot for a column outside its key', () => {
        const { db, cards, cardsService } = createCards();
        const byDeckService = setDrivenByColumn(db, cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const rankOfSpades = byDeckService.holdBucketColumnByKey(byDeck, 'spades', 'rank');
        const revisionBefore = rankOfSpades.changedAtRevision;
        updateByKey(cardsService, cards, 'c2', { rank: 3 });
        db.flush();
        expect(rankOfSpades.changedAtRevision === revisionBefore).toBe(false);
    });
});
