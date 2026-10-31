import { OIMDB, OIMSlotContentPositionalArrayBucketService, OIMSlotContentSetBucketService, OIMBucketCommands, OIMSlotMapStoreService, createOIMBucketMemoComputedService, createOIMSortedComputedService, createOIMSlotCollectionIndexService } from '@oimdb/core';
import type {
    TOIMBucketSlot,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
    TOIMBucketSlotsArrayStore,
} from '@oimdb/core';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';

export type TCard = { id: string; deckId: string; rank: number; title: string };

type TCardSlot = TOIMEntitySlot<TCard>;

const createCardsService = () => createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>(), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });

const createByDeckService = () => createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });

const createRankedService = () => createOIMSlotCollectionService({ slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot>() });

const createBoardService = () => createOIMSlotCollectionService({ slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot>({
        bucketCommands: new OIMBucketCommands({}),
    }) });

const createRankedByDeckService = (cardsService: TCardsService) => () => createOIMSlotCollectionIndexService({
    entityService: cardsService,
    keyOf: (card: TCard) => card.deckId,
});

type TCardsService = ReturnType<typeof createCardsService>;
type TRankedService = ReturnType<typeof createRankedService>;
type TRankedByDeckService = ReturnType<ReturnType<typeof createRankedByDeckService>>;

const createRankedOrdersService = (rankedByDeckService: TRankedByDeckService) => createOIMSortedComputedService({
    indexService: rankedByDeckService,
    sortColumns: [{ columnName: 'rank', direction: 'asc' }],
});

const createOrderService = (rankedService: TRankedService) => createOIMBucketMemoComputedService({
    bucketCollectionService: rankedService,
});

export type TExoTestWorld = {
    db: OIMDB;
    cardsService: TCardsService;
    cards: ReturnType<TCardsService['createStoreSlot']>;
    /** A row, written and then resolved — a read never mints, so the write is the door. */
    slotOf(card: TCard): TOIMEntitySlot<TCard, TOIMStoreKey>;
    find(id: string): TOIMEntitySlot<TCard, TOIMStoreKey>;
    updateCard(id: string, patch: Partial<TCard>): void;
    /** Slots the caller writes, in no order. */
    byDeckService: ReturnType<typeof createByDeckService>;
    byDeck: ReturnType<ReturnType<typeof createByDeckService>['createStoreSlot']>;
    /** Slots the caller writes, in the order the caller writes them. */
    rankedService: TRankedService;
    ranked: ReturnType<TRankedService['createStoreSlot']>;
    /** The order of a `ranked` bucket, as one derivation per key. */
    orderService: ReturnType<typeof createOrderService>['computedCollectionService'];
    order: ReturnType<ReturnType<typeof createOrderService>['createBucketMemoStoreSlot']>;
    rankedByDeckService: TRankedByDeckService;
    rankedByDeck: ReturnType<TRankedByDeckService['createIndexStoreSlot']>;
    rankedOrdersService: ReturnType<typeof createRankedOrdersService>['computedCollectionService'];
    rankedOrders: ReturnType<ReturnType<typeof createRankedOrdersService>['createSortedStoreSlot']>;
    /** Slots and positions the caller writes, with the engine recording the script. */
    boardService: ReturnType<typeof createBoardService>;
    board: ReturnType<ReturnType<typeof createBoardService>['createStoreSlot']>;
    /** Appends through the one door a position list has for it. */
    appendTo(bucket: TOIMBucketSlot<TOIMBucketSlotsArrayStore<TCardSlot>, TOIMStoreKey>, slot: TCardSlot): void;
    bucketOf<TSlots, TStoreSlot>(
        bucketService: { holdSlotByKey(storeSlot: TStoreSlot, key: TOIMStoreKey): TOIMBucketSlot<TSlots, TOIMStoreKey> },
        bucketStoreSlot: TStoreSlot,
        key: TOIMStoreKey,
    ): TOIMBucketSlot<TSlots, TOIMStoreKey>;
};

export function build(): TExoTestWorld {
    const db = new OIMDB();
    const cardsService = createCardsService();
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createByDeckService();
    const byDeck = byDeckService.createStoreSlot(db);
    const rankedService = createRankedService();
    const ranked = rankedService.createStoreSlot(db);
    const rankedByDeckService = createRankedByDeckService(cardsService)();
    const rankedByDeck = rankedByDeckService.createIndexStoreSlot(cards);
    const rankedOrdersService = createRankedOrdersService(rankedByDeckService);
    const rankedOrders = rankedOrdersService.createSortedStoreSlot(rankedByDeck);
    const orderService = createOrderService(rankedService);
    const order = orderService.createBucketMemoStoreSlot(ranked);
    const boardService = createBoardService();
    const board = boardService.createStoreSlot(db);
    const find = (id: string): TOIMEntitySlot<TCard, TOIMStoreKey> => cardsService.getSlotByKey(cards, id);
    return {
        db,
        cardsService,
        cards,
        byDeckService,
        byDeck,
        rankedService,
        ranked,
        orderService: orderService.computedCollectionService,
        order,
        rankedByDeckService,
        rankedByDeck,
        rankedOrdersService: rankedOrdersService.computedCollectionService,
        rankedOrders,
        boardService,
        board,
        appendTo: (bucket, slot) => {
            const slotContentService = boardService.slotContentService;
            slotContentService.insertBucketMemberSlotAt(bucket, slotContentService.getBucketMemberSlotCount(bucket), slot);
        },
        slotOf: (card: TCard): TOIMEntitySlot<TCard, TOIMStoreKey> => {
            cardsService.writeSlotContentByKey(cards, card.id, card);
            return find(card.id);
        },
        find,
        updateCard: (id, patch) => {
            cardsService.slotContentService.updateEntity(find(id), patch);
        },
        // THE HOLD IS KEPT, not given straight back: an empty bucket holding
        // nothing is unfiled by the release itself, and every suite here starts
        // from one. The world lives for one `it`, so the hold goes with it.
        bucketOf: (bucketService, bucketStoreSlot, key) => bucketService.holdSlotByKey(bucketStoreSlot, key),
    };
}
