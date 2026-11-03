import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMComputedService } from '../createOIMComputedService';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMColumnGroup } from '../../column/utils/createOIMColumnGroup';
import { createOIMSingleComputedService } from '../createOIMSingleComputedService';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCard = { id: string; deck: string; rank: number; title: string };
type TSummary = { topRank: number; titles: string };

const summaryColumns = createOIMColumnGroup<keyof TSummary>(['topRank', 'titles']);

function setUp() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1, title: 'Ace' });
    const two = cardsService.writeSlotContentByKey(cards, 'two', { id: 'two', deck: 'spades', rank: 2, title: 'Two' });
    const summaryComputedService = createOIMSingleComputedService<TSummary>({ columnGroups: [summaryColumns] });
    const summary = summaryComputedService.createStoreSlot(
        db,
        () => ({
            topRank: Math.max(ace.entity?.rank ?? 0, two.entity?.rank ?? 0),
            titles: `${ace.entity?.title ?? ''},${two.entity?.title ?? ''}`,
        }),
        () => ({ sourceSlots: [ace, two] }),
    );
    db.flush();
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.peekSlotByKey(cards, id);
        if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
    };
    return { db, effectService, cardsService, cards, summaryService: summaryComputedService, summary, updateCard };
}

describe('a column of a computed value', () => {
    it('wakes its effect when that field of the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const topRank = summaryService.getSingleSlot(summary).holdColumnSlot('topRank');
        const seen: unknown[] = [];
        effectService.createAndRunEffect(db, () => { seen.push(readValueWithoutTracking(summaryService.getSingleSlot(summary) as TOIMComputedContentSlot<TSummary>).topRank); }, [], [topRank]);

        updateCard('two', { rank: 5 });
        db.flush();

        expect(seen).toEqual([2, 5]);
    });

    it('stays silent when another field of the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const topRank = summaryService.getSingleSlot(summary).holdColumnSlot('topRank');
        let runs = 0;
        effectService.createAndRunEffect(db, () => { runs++; }, [], [topRank]);

        updateCard('ace', { title: 'Ace of Spades' });
        db.flush();

        expect(runs).toBe(1);
        expect(topRank.value).toBe(2);
    });

    it('hands a new column group slot its value at once', () => {
        const { summaryService, summary } = setUp();
        const group = summaryService.getSingleSlot(summary).holdColumnGroupSlot(summaryColumns);
        expect(group.value).toBeDefined();
    });

    it('wakes a column group once when any of its fields changes, and not for the others', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const group = summaryService.getSingleSlot(summary).holdColumnGroupSlot(summaryColumns);
        let runs = 0;
        effectService.createAndRunEffect(db, () => { runs++; }, [], [group]);

        updateCard('ace', { title: 'Ace of Spades' });
        db.flush();
        updateCard('ace', { deck: 'hearts' });
        db.flush();

        expect(runs).toBe(2);
        expect(group.value).toEqual(['Ace of Spades,Two', 2]);
    });

    it('wakes the any-column slot whenever the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const anyColumn = summaryService.getSingleSlot(summary).holdAnyColumnSlot();
        let runs = 0;
        effectService.createAndRunEffect(db, () => { runs++; }, [], [anyColumn]);

        updateCard('ace', { title: 'Ace of Spades' });
        db.flush();
        updateCard('ace', { deck: 'hearts' });
        db.flush();

        expect(runs).toBe(3);
    });

    it('keeps its computed slot alive while held and is released after the last hold goes', () => {
        const { db, summaryService, summary } = setUp();
        const computedSlot = summaryService.getSingleSlot(summary);
        const topRank = summaryService.columnSlotService.holdColumnSlot(computedSlot, 'topRank');
        db.flush();
        expect(isOIMSlotReleased(computedSlot)).toBe(false);

        summaryService.columnSlotService.unholdColumnSlot(topRank);
        db.flush();

        expect(isOIMSlotReleased(topRank)).toBe(true);
    });

    it('is the column slot an entity column is, its carrier the only source', () => {
        const { cardsService, cards, summaryService, summary } = setUp();
        const computedSlot = summaryService.getSingleSlot(summary);
        const topRank = summaryService.columnSlotService.holdColumnSlot(computedSlot, 'topRank');
        const titleColumn = cardsService.columnSlotService.holdColumnSlot(cardsService.getSlotByKey(cards, 'ace'), 'title');

        expect(Object.keys(topRank)).toEqual(Object.keys(titleColumn));
        expect(topRank.constructor).toBe(titleColumn.constructor);
        expect(topRank.sourceComputeds).toEqual([computedSlot]);
        expect(topRank.carrierSlot).toBe(computedSlot);
        summaryService.columnSlotService.unholdColumnSlot(topRank);
    });

    it('reads its field from each key of a computed collection on its own', () => {
        const { db, effectService, updateCard, cardsService, cards } = setUp();
        const ranksByDeckComputedService = createOIMComputedService<string, { size: number }>({
            createSources: ({ key: deck }) => ({ sourceSlots: [cardsService.getSlotByKey(cards, deck === 'spades' ? 'ace' : 'two')] }),
            derive: computedSlot => ({ size: (cardsService.getSlotByKey(cards, computedSlot.key === 'spades' ? 'ace' : 'two').entity?.rank ?? 0) * 10 }),
        });
        const ranksByDeck = ranksByDeckComputedService.createStoreSlot(db);
        const spadesSize = ranksByDeckComputedService.holdSlotByKey(ranksByDeck, 'spades').holdColumnSlot('size');
        const seen: number[] = [];
        effectService.createAndRunEffect(db, () => { seen.push(spadesSize.value as number); }, [], [spadesSize]);

        updateCard('two', { rank: 9 });
        db.flush();
        updateCard('ace', { rank: 3 });
        db.flush();

        expect(seen).toEqual([10, 30]);
    });
});
