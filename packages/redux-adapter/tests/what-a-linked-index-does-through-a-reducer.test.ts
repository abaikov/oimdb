import { OIMDB } from '@oimdb/core';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxLinkedIndex} from '../src';
import {
    OIMReduxAdapter,
    EOIMReduxReducerActionType
} from '../src';
import type { TBucketService, TBucketStoreSlot } from './support/engine';
import {
    bucketServiceOf, deleteEntityByKey, entityServiceOf, replacingEntityServiceOf, updateEntityByKey,
} from './support/engine';

type TDeck = { id: string; name: string; cardIds: string[] };
type TCard = { id: string; title: string };
type TDeckState = TOIMReduxDefaultCollectionState<TDeck, string>;

/** The slots a linked-index bucket holds, by key, or `[]` for no bucket. */
function slotKeysOf(cardsByDeckService: TBucketService<TCard>, cardsByDeck: TBucketStoreSlot<TCard>, key: string): unknown[] {
    const bucket = cardsByDeckService.findSlotByKey(cardsByDeck, key);
    if (bucket === undefined) return [];
    return Array.from(cardsByDeckService.slotContentService.getBucketMemberSlots(bucket)).map(slot => slot.key);
}

function build() {
    const db = new OIMDB();
    // The linked-index diff keys off entity-reference equality, so the watched
    // collection needs a write strategy that allocates on change.
    const decksService = replacingEntityServiceOf<TDeck>(db, item => item.id);
    const decks = decksService.createStoreSlot(db);
    const cardsService = entityServiceOf<TCard>(db, item => item.id);
    const cards = cardsService.createStoreSlot(db);
    const cardsByDeckService = bucketServiceOf<TCard>(db);
    const cardsByDeck = cardsByDeckService.createStoreSlot(db);
    const adapter = new OIMReduxAdapter({ channelMap: db });
    const linkedIndexes: ReadonlyArray<TOIMReduxLinkedIndex<TDeck, TCard>> = [
        {
            bucketService: cardsByDeckService,
            bucketStoreSlot: cardsByDeck,
            linkedEntityService: cardsService,
            linkedEntityStoreSlot: cards,
            fieldName: 'cardIds',
        },
    ];
    return { db, decksService, decks, cardsService, cards, cardsByDeckService, cardsByDeck, adapter, linkedIndexes };
}

describe('linked indexes (deck.cardIds -> index[deck.id] = cardIds)', () => {
    test("a change to the linked field re-derives the index's slots", () => {
        const { db, decksService, decks, cardsService, cards, cardsByDeckService, cardsByDeck, adapter, linkedIndexes } = build();
        const reducer = adapter.createCollectionReducer<TDeck, string, TDeckState>(
            decksService, decks, { reducer: s => s ?? { entities: {}, ids: [] }, linkedIndexes });

        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', title: 'Ace' },
            { id: 'c2', title: 'King' },
        ]);
        decksService.slotContentService.upsertEntity(decks, { id: 'd1', name: 'Starter', cardIds: ['c1', 'c2'] });
        db.flush();
        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });

        // The deck was already there when the reducer first ran, which is the
        // ordinary order: rows land, then a store is created over them (see
        // `watching-a-collection-does-not-pin-its-identities.test.ts`). The first application has no old state to diff
        // against, so it derives the slots for everything it built the state
        // from — otherwise a page loaded once and only read would show every
        // deck with no cards, forever.
        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 'd1')).toEqual(['c1', 'c2']);

        // Swap the deck's card list for a new array (same rule: reference-diffed).
        updateEntityByKey(decksService, decks,'d1', { cardIds: ['c2'] });
        db.flush();
        const s2 = reducer(s1, { type: EOIMReduxReducerActionType.UPDATE });
        expect(s2).not.toBe(s1);

        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 'd1')).toEqual(['c2']);
    });

    test('removing the owning entity clears its linked-index bucket', () => {
        const { db, decksService, decks, cardsService, cards, cardsByDeckService, cardsByDeck, adapter, linkedIndexes } = build();
        const reducer = adapter.createCollectionReducer<TDeck, string, TDeckState>(
            decksService, decks, { reducer: s => s ?? { entities: {}, ids: [] }, linkedIndexes });

        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', title: 'Ace' }]);
        decksService.slotContentService.upsertEntity(decks, { id: 'd1', name: 'Starter', cardIds: ['c1'] });
        db.flush();
        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });

        updateEntityByKey(decksService, decks,'d1', { name: 'Starter (renamed)' });
        db.flush();
        const s2 = reducer(s1, { type: EOIMReduxReducerActionType.UPDATE });
        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 'd1')).toEqual(['c1']);

        deleteEntityByKey(decksService, decks,'d1');
        db.flush();
        reducer(s2, { type: EOIMReduxReducerActionType.UPDATE });
        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 'd1')).toEqual([]);
    });
});

describe('linked indexes and a custom extractor', () => {
    test('supplying both is refused, because only one of them is honoured', () => {
        const { decksService, decks, adapter, linkedIndexes } = build();

        // A custom extractor does its own syncing, so the engine never learns
        // which entities moved — and cannot maintain a linked index from that.
        // Accepting both quietly maintained neither.
        expect(() =>
            adapter.createCollectionReducer<TDeck, string, TDeckState>(decksService, decks, {
                reducer: s => s ?? { entities: {}, ids: [] },
                extractEntities: () => { /* never reached: the call above is refused before it runs */ },
                linkedIndexes,
            }),
        ).toThrow(/linkedIndexes/);
    });
});
