import type { Store } from 'redux';
import { OIMChannelService, OIMDB, OIMErrorPolicyThrowAtOnce } from '@oimdb/core';
import { applyMiddleware, createStore } from 'redux';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxLinkedIndex,
} from '../src';
import { OIMReduxAdapter } from '../src';
import type { TBucketService, TBucketStoreSlot } from './support/engine';
import { bucketServiceOf, entityServiceOf, replacingEntityServiceOf, updateEntityByKey } from './support/engine';

type TDeck = { id: string; name: string; cardIds: string[] };
type TCard = { id: string; title: string };
type TDeckState = TOIMReduxDefaultCollectionState<TDeck, string>;

const REFUSAL = 'writes are refused for the whole of a flush';

const passThroughChildReducer = (state: TDeckState | undefined): TDeckState =>
    state ?? { entities: {}, ids: [] };

const slotKeysOf = (cardsByDeckService: TBucketService<TCard>, cardsByDeck: TBucketStoreSlot<TCard>, key: string): unknown[] => {
    const bucket = cardsByDeckService.findSlotByKey(cardsByDeck, key);
    if (bucket === undefined) return [];
    return Array.from(cardsByDeckService.slotContentService.getBucketMemberSlots(bucket)).map(slot => slot.key);
};

const messagesOf = (thrown: unknown): string[] => {
    if (thrown === undefined) return [];
    if (thrown instanceof AggregateError) {
        return thrown.errors.map(one => (one instanceof Error ? one.message : String(one)));
    }
    return [thrown instanceof Error ? thrown.message : String(thrown)];
};

const whatEscaped = (run: () => void): unknown => {
    try {
        run();
        return undefined;
    } catch (thrown) {
        return thrown;
    }
};

const countFramesEnded = (db: OIMDB): (() => number) => {
    let framesEnded = 0;
    OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, () => { framesEnded++; });
    return () => framesEnded;
};

function buildWorld(withLinkedIndex: boolean) {
    const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
    const decksService = replacingEntityServiceOf<TDeck>(db,deck => deck.id);
    const decks = decksService.createStoreSlot(db);
    const cardsService = entityServiceOf<TCard>(db,card => card.id);
    const cards = cardsService.createStoreSlot(db);
    const cardsByDeckService = bucketServiceOf<TCard>(db);
    const cardsByDeck = cardsByDeckService.createStoreSlot(db);
    const adapter = new OIMReduxAdapter({ channelMap: db });

    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', title: 'Ace' },
        { id: 'c2', title: 'King' },
    ]);
    decksService.slotContentService.upsertEntity(decks, { id: 'd1', name: 'Starter', cardIds: ['c1'] });

    const linkedIndexes: ReadonlyArray<TOIMReduxLinkedIndex<TDeck, TCard>> = [
        {
            bucketService: cardsByDeckService,
            bucketStoreSlot: cardsByDeck,
            linkedEntityService: cardsService,
            linkedEntityStoreSlot: cards,
            fieldName: 'cardIds',
        },
    ];
    const reducer = adapter.createCollectionReducer<TDeck, string, TDeckState>(
        decksService,
        decks,
        withLinkedIndex
            ? { reducer: passThroughChildReducer, keyOf: deck => deck.id, linkedIndexes }
            : { reducer: passThroughChildReducer, keyOf: deck => deck.id },
    );

    const store: Store = createStore(
        reducer as never, applyMiddleware(adapter.createMiddleware()));
    adapter.setStore(store);

    const cardIdsInStore = (): string[] | undefined => {
        const entities = (store.getState() as TDeckState).entities as
            Record<string, TDeck | undefined>;
        return entities.d1?.cardIds;
    };

    const cardIdsInEngine = (): string[] | undefined =>
        decksService.getSlotByKey(decks, 'd1')?.entity?.cardIds;

    return {
        db, decksService, decks, cardsService, cards, cardsByDeckService, cardsByDeck, adapter, store,
        cardIdsInStore, cardIdsInEngine,
    };
}

describe('what a dispatch made after a frame is allowed to write', () => {
    test('a linked-index write reached from the OIMDB_UPDATE the frame tail dispatches', () => {
        const world = buildWorld(true);
        const { db, decksService, decks, cardsByDeckService, cardsByDeck, cardIdsInStore, cardIdsInEngine } = world;

        expect(cardIdsInStore()).toEqual(['c1']);
        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 'd1')).toEqual(['c1']);

        updateEntityByKey(decksService, decks,'d1', { cardIds: ['c1', 'c2'] });

        const framesEnded = countFramesEnded(db);
        const escapedFirstFlush = whatEscaped(() => { db.flush(); });
        const escapedSecondFlush = whatEscaped(() => { db.flush(); });

        expect({
            firstFlushThrew: escapedFirstFlush !== undefined,
            firstFlushMessages: messagesOf(escapedFirstFlush),
            secondFlushThrew: escapedSecondFlush !== undefined,
            secondFlushMessages: messagesOf(escapedSecondFlush),
            framesSpentOnTwoFlushes: framesEnded(),
            cardIdsInEngine: cardIdsInEngine(),
            linkedIndexHolds: slotKeysOf(cardsByDeckService, cardsByDeck, 'd1'),
            cardIdsInStore: cardIdsInStore(),
        }).toEqual({
            firstFlushThrew: true,
            firstFlushMessages: [expect.stringContaining(REFUSAL)],
            secondFlushThrew: false,
            secondFlushMessages: [],
            framesSpentOnTwoFlushes: 2,
            cardIdsInEngine: ['c1', 'c2'],
            linkedIndexHolds: ['c1'],
            cardIdsInStore: ['c1'],
        });
    });

    test('the same frame tail with no linked index, so the dispatch writes nothing', () => {
        const world = buildWorld(false);
        const { db, decksService, decks, cardsByDeckService, cardsByDeck, cardIdsInStore, cardIdsInEngine } = world;

        updateEntityByKey(decksService, decks,'d1', { cardIds: ['c1', 'c2'] });

        const framesEnded = countFramesEnded(db);
        const escaped = whatEscaped(() => { db.flush(); });

        expect({
            threw: escaped !== undefined,
            messages: messagesOf(escaped),
            framesSpentOnOneFlush: framesEnded(),
            cardIdsInEngine: cardIdsInEngine(),
            linkedIndexHolds: slotKeysOf(cardsByDeckService, cardsByDeck, 'd1'),
            cardIdsInStore: cardIdsInStore(),
        }).toEqual({
            threw: false,
            messages: [],
            framesSpentOnOneFlush: 1,
            cardIdsInEngine: ['c1', 'c2'],
            linkedIndexHolds: [],
            cardIdsInStore: ['c1', 'c2'],
        });
    });

    test('the nested flush the middleware runs in the frame tail spends no frame of its own', () => {
        const world = buildWorld(false);
        const { db, decksService, decks } = world;

        const framesEnded = countFramesEnded(db);
        const framesPerFlush: number[] = [];
        for (const cardIds of [['c2'], ['c1'], ['c1', 'c2']]) {
            updateEntityByKey(decksService, decks,'d1', { cardIds });
            const before = framesEnded();
            db.flush();
            framesPerFlush.push(framesEnded() - before);
        }

        expect(framesPerFlush).toEqual([1, 1, 1]);
    });
});

describe('what the channel refuses to the frame tail directly', () => {
    test('an after-each-frame handler writing to a collection', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const cardsService = entityServiceOf<TCard>(db,card => card.id);
        const cards = cardsService.createStoreSlot(db);
        const decksService = replacingEntityServiceOf<TDeck>(db,deck => deck.id);
        const decks = decksService.createStoreSlot(db);

        decksService.slotContentService.upsertEntity(decks, { id: 'd1', name: 'Starter', cardIds: [] });
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
            cardsService.slotContentService.upsertEntity(cards, { id: 'c9', title: 'Nine' });
        });
        updateEntityByKey(decksService, decks,'d1', { name: 'Renamed' });

        const escaped = whatEscaped(() => { db.flush(); });

        expect({
            threw: escaped !== undefined,
            messages: messagesOf(escaped),
            landed: cardsService.getSlotByKey(cards, 'c9')?.entity,
        }).toEqual({
            threw: true,
            messages: [expect.stringContaining(REFUSAL)],
            landed: undefined,
        });
    });

    test('onBeforeFlush writing to a collection, the door the docs call the last accepted moment', () => {
        let writeFromBeforeFlush: () => void = () => { return; };
        const db = new OIMDB({
            errorPolicy: new OIMErrorPolicyThrowAtOnce(),
            onBeforeFlush: () => { writeFromBeforeFlush(); },
        });
        const cardsService = entityServiceOf<TCard>(db,card => card.id);
        const cards = cardsService.createStoreSlot(db);
        const decksService = replacingEntityServiceOf<TDeck>(db,deck => deck.id);
        const decks = decksService.createStoreSlot(db);

        decksService.slotContentService.upsertEntity(decks, { id: 'd1', name: 'Starter', cardIds: [] });
        writeFromBeforeFlush = () => { cardsService.slotContentService.upsertEntity(cards, { id: 'c9', title: 'Nine' }); };

        const escaped = whatEscaped(() => { db.flush(); });

        expect({
            threw: escaped !== undefined,
            messages: messagesOf(escaped),
            landed: cardsService.getSlotByKey(cards, 'c9')?.entity,
        }).toEqual({
            threw: true,
            messages: [expect.stringContaining(REFUSAL)],
            landed: undefined,
        });
    });
});
