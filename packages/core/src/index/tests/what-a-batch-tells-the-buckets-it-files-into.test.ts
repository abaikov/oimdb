import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const GROUPS = 5;
const ROWS = 100;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const decksService = createOIMSlotCollectionIndexService({
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentSetBucketService<TCardSlot>(),
    });
    const decks = decksService.createIndexStoreSlot(cards);
    const heldDecks: ReturnType<typeof decksService.holdSlotByKey>[] = [];
    for (let g = 0; g < GROUPS; g++) heldDecks.push(decksService.holdSlotByKey(decks, `d${g}`));
    db.flush();

    const held = new Set<unknown>(heldDecks);
    const write = jest.spyOn(OIMChannelService.INSTANCE, 'writeWithoutFlushCheck');
    const writtenBuckets = (): number => write.mock.calls.filter(([, slot]) => held.has(slot)).length;
    return { db, cardsService, cards, decksService, decks, heldDecks, writtenBuckets };
};

const rows = (title: string): TCard[] => {
    const all: TCard[] = [];
    for (let i = 0; i < ROWS; i++) all.push({ id: `${title}${i}`, deck: `d${i % GROUPS}` });
    return all;
};

afterEach(() => {
    jest.restoreAllMocks();
});

describe('what a batch tells the buckets it files into', () => {
    it('names each bucket it filled once for the batch, not once per row', () => {
        const fixture = createFixture();

        fixture.cardsService.writeInBatch(fixture.cards, () => (rows('c')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(fixture.writtenBuckets()).toBe(GROUPS);
    });

    it('files every row of the batch into its own bucket', () => {
        const fixture = createFixture();

        fixture.cardsService.writeInBatch(fixture.cards, () => (rows('c')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        const counts = fixture.heldDecks.map(
            deck => fixture.decksService.slotContentService.getBucketMemberSlotCount(deck),
        );
        expect(counts).toEqual([20, 20, 20, 20, 20]);
    });

    it('wakes an effect over one bucket exactly once for the whole batch', () => {
        const fixture = createFixture();
        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(fixture.db, () => { runCount++; }, [fixture.heldDecks[0]]);
        fixture.db.flush();
        runCount = 0;

        fixture.cardsService.writeInBatch(fixture.cards, () => (rows('c')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(runCount).toBe(1);
    });

    it('moves a row between buckets and names both once', () => {
        const fixture = createFixture();
        fixture.cardsService.writeInBatch(fixture.cards, () => (rows('c')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();
        const before = fixture.writtenBuckets();

        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c0', { id: 'c0', deck: 'd1' });
        fixture.db.flush();

        expect(fixture.writtenBuckets() - before).toBe(2);
        expect(fixture.decksService.slotContentService.getBucketMemberSlotCount(fixture.heldDecks[0])).toBe(19);
        expect(fixture.decksService.slotContentService.getBucketMemberSlotCount(fixture.heldDecks[1])).toBe(21);
    });

    it('names no bucket for a batch that moved nobody between them', () => {
        const fixture = createFixture();
        fixture.cardsService.writeInBatch(fixture.cards, () => (rows('c')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();
        const before = fixture.writtenBuckets();

        fixture.cardsService.writeInBatch(fixture.cards, () => (rows('c')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(fixture.writtenBuckets() - before).toBe(0);
    });
});
