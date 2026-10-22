import {
    OIMDB, OIMSlotContentBucketServiceArrayDriven, OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService, createOIMEntityService, createOIMIndexService, createOIMSingleBucketService,
} from '../../../index';
import type { TOIMBucketSlotsSetStore, TOIMEntityColumnName, TOIMEntitySlot } from '../../../index';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;

export function aSetBucketIsAskedForNoPosition(): void {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'd1' });
    const decksService = createOIMBucketService<TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>>(
        db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() },
    );
    const decks = decksService.createStoreSlot(db);
    const deck = decksService.getSlotByKey(decks, 'd1');
    const singleDeckService = createOIMSingleBucketService<TCardSlot, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>>(
        db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() },
    );
    const singleDeck = singleDeckService.getSingleSlot(singleDeckService.createStoreSlot(db));
    const byDeckService = createOIMIndexService<
        TCard, string, readonly TOIMEntityColumnName<TCard>[], string, unknown,
        TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, {
        entityService: cardsService,
        keyOf: (entity: TCard) => entity.deck,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const setDriven = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();

    // @ts-expect-error a Set has no place to name
    decksService.slotContentService.getBucketMemberSlotAt(deck, 0);
    // @ts-expect-error nor a place to find
    decksService.slotContentService.getBucketMemberSlotPosition(deck, card);
    // @ts-expect-error the single bucket on a Set neither
    singleDeckService.slotContentService.getBucketMemberSlotAt(singleDeck, 0);
    // @ts-expect-error nor its index
    singleDeckService.slotContentService.getBucketMemberSlotPosition(singleDeck, card);
    // @ts-expect-error an index has no positions to read
    byDeckService.slotContentService.getBucketMemberSlotAt(byDeckService.getSlotByKey(byDeck, 'd1'), 0);
    // @ts-expect-error the Set service answers no position
    setDriven.getBucketMemberSlotPosition(deck, card);
    // @ts-expect-error and holds no slot at one
    setDriven.getBucketMemberSlotAt(deck, 0);
}

export function anArrayBucketStillAnswersBoth(): void {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'd1' });
    const pagesService = createOIMBucketService<TCardSlot, string>(db);
    const pages = pagesService.createStoreSlot(db);
    const page = pagesService.getSlotByKey(pages, 'p1');
    const singlePageService = createOIMSingleBucketService<TCardSlot>(db);
    const singlePage = singlePageService.getSingleSlot(singlePageService.createStoreSlot(db));
    const arrayDriven = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();

    pagesService.slotContentService.getBucketMemberSlotAt(page, 0);
    pagesService.slotContentService.getBucketMemberSlotPosition(page, card);
    singlePageService.slotContentService.getBucketMemberSlotAt(singlePage, 0);
    singlePageService.slotContentService.getBucketMemberSlotPosition(singlePage, card);
    arrayDriven.getBucketMemberSlotPosition(page, card);
    arrayDriven.getBucketMemberSlotAt(page, 0);
}
