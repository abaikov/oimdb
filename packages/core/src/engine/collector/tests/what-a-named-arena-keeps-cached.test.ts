import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMUnusedSlotCollectorService } from '../OIMUnusedSlotCollectorService';
import { createOIMUnusedSlotCollectorSlot } from '../utils/createOIMUnusedSlotCollectorSlot';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    let built = 0;
    const ranksService = createOIMComputedService<string, number>({
        createSources: (id: string) => {
            built++;
            return { sourceSlots: [cardsService.getSlotByKey(cards, id)] };
        },
        derive: (computedSlot) => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const ranks = ranksService.createComputedStoreSlot(db);
    const ranksCollectionService = ranksService.computedCollectionService;
    return {
        db,
        cardsService,
        cards,
        ranksCollectionService,
        ranks,
        builtCount: (): number => built,
        flushUnusedSlotCollector: (): void => {
            OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        },
        readValueByKey: (key: string): number => ranksCollectionService.slotContentService.getValueForSlot(
            ranksCollectionService.getSlotByKey(ranks, key),
        ),
    };
};

describe('an arena is a collector of its own, and its lifetime is the caller\'s', () => {
    it('keeps a derivation alive after the turn that read it has settled', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', rank: 1 });
        fixture.db.flush();

        const arena = createOIMUnusedSlotCollectorSlot();
        const derived = fixture.ranksCollectionService.getSlotByKey(fixture.ranks, 'a');
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(arena, derived);
        fixture.db.flush();
        fixture.flushUnusedSlotCollector();

        expect(fixture.ranksCollectionService.getSlotByKey(fixture.ranks, 'a')).toBe(derived);
        expect(fixture.builtCount()).toBe(1);

        void fixture.readValueByKey('a');
        fixture.flushUnusedSlotCollector();

        expect(fixture.builtCount()).toBe(1);
    });

    it('lets the whole subtree go when the caller ends the arena, and nothing else held it', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', rank: 1 });
        fixture.db.flush();

        const arena = createOIMUnusedSlotCollectorSlot();
        const derived = fixture.ranksCollectionService.getSlotByKey(fixture.ranks, 'a');
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(arena, derived);
        fixture.db.flush();
        fixture.flushUnusedSlotCollector();
        expect(fixture.ranksCollectionService.getSlotByKey(fixture.ranks, 'a')).toBe(derived);

        OIMUnusedSlotCollectorService.INSTANCE.flush(arena);

        expect(oimIsSlotReleased(derived)).toBe(true);
        expect(fixture.ranksCollectionService.getSlotCount(fixture.ranks)).toBe(0);
    });

    it('is rebuilt once the arena let it go, which is what proves the arena was the cache', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', rank: 1 });
        fixture.db.flush();

        const arena = createOIMUnusedSlotCollectorSlot();
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(arena, fixture.ranksCollectionService.getSlotByKey(fixture.ranks, 'a'));
        fixture.db.flush();
        fixture.flushUnusedSlotCollector();
        OIMUnusedSlotCollectorService.INSTANCE.flush(arena);

        void fixture.readValueByKey('a');
        expect(fixture.builtCount()).toBe(2);
    });

    it('nests, so an inner scope ending does not drop what an outer one is standing on', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'a', rank: 1 });
        fixture.db.flush();

        const arena = createOIMUnusedSlotCollectorSlot();
        OIMUnusedSlotCollectorService.INSTANCE.open(arena);
        const derived = fixture.ranksCollectionService.getSlotByKey(fixture.ranks, 'a');
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(arena, derived);
        OIMUnusedSlotCollectorService.INSTANCE.run(arena, () => undefined);

        expect(fixture.ranksCollectionService.getSlotByKey(fixture.ranks, 'a')).toBe(derived);

        OIMUnusedSlotCollectorService.INSTANCE.close(arena);

        fixture.flushUnusedSlotCollector();
        expect(oimIsSlotReleased(derived)).toBe(true);
        expect(fixture.ranksCollectionService.getSlotCount(fixture.ranks)).toBe(0);
    });
});
