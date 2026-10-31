import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMComputedService } from '../createOIMComputedService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../createOIMSingleComputedService';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';

type TCard = { id: string; deck: string; rank: number; title: string };
type TSummary = { topRank: number; titles: string };

function setUp() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1, title: 'Ace' });
    const two = cardsService.writeSlotContentByKey(cards, 'two', { id: 'two', deck: 'spades', rank: 2, title: 'Two' });
    const summaryComputedService = createOIMSingleComputedService<TSummary>();
    const summary = summaryComputedService.createComputedStoreSlot(
        db,
        () => ({
            topRank: Math.max(ace.entity?.rank ?? 0, two.entity?.rank ?? 0),
            titles: `${ace.entity?.title ?? ''},${two.entity?.title ?? ''}`,
        }),
        () => ({ sourceSlots: [ace, two] }),
    );
    db.flush();
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.findSlotByKey(cards, id);
        if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
    };
    return { db, effectService, cardsService, cards, summaryService: summaryComputedService.computedSingleSlotService, summary, updateCard };
}

describe('a column of a computed value', () => {
    it('wakes its effect when that field of the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const topRank = summaryService.columnSlotService.holdColumn(summaryService.getSingleSlot(summary), 'topRank');
        const seen: unknown[] = [];
        effectService.createAndRunEffect(db, () => { seen.push(((summaryService.getSingleSlot(summary)) as TOIMComputedContentSlot<TSummary>).computedValueService.getValueForSlot(summaryService.getSingleSlot(summary)).topRank); }, [], [topRank]);

        updateCard('two', { rank: 5 });
        db.flush();

        expect(seen).toEqual([2, 5]);
    });

    it('stays silent when another field of the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const topRank = summaryService.columnSlotService.holdColumn(summaryService.getSingleSlot(summary), 'topRank');
        let runs = 0;
        effectService.createAndRunEffect(db, () => { runs++; }, [], [topRank]);

        updateCard('ace', { title: 'Ace of Spades' });
        db.flush();

        expect(runs).toBe(1);
        expect(topRank.value).toBe(2);
    });

    it('wakes a column group once when any of its fields changes, and not for the others', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const group = summaryService.columnSlotService.holdColumnGroup(summaryService.getSingleSlot(summary), summaryService.columnSlotService.getColumnGroup(['topRank', 'titles']));
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
        const anyColumn = summaryService.columnSlotService.holdAnyColumn(summaryService.getSingleSlot(summary));
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
        const topRank = summaryService.columnSlotService.holdColumn(computedSlot, 'topRank');
        db.flush();
        expect(oimIsSlotReleased(computedSlot)).toBe(false);

        summaryService.columnSlotService.unholdColumn(topRank);
        db.flush();

        expect(oimIsSlotReleased(topRank)).toBe(true);
    });

    it('is a computed slot of the same shape as every other, its carrier the only source', () => {
        const { summaryService, summary } = setUp();
        const computedSlot = summaryService.getSingleSlot(summary);
        const topRank = summaryService.columnSlotService.holdColumn(computedSlot, 'topRank');

        expect(Object.keys(topRank).sort()).toEqual(Object.keys(computedSlot).sort());
        expect(topRank.sourceComputeds).toEqual([computedSlot]);
        summaryService.columnSlotService.unholdColumn(topRank);
    });

    it('reads its field from each key of a computed collection on its own', () => {
        const { db, effectService, updateCard, cardsService, cards } = setUp();
        const ranksByDeckComputedService = createOIMComputedService<string, { size: number }>({
            createSources: ({ key: deck }) => ({ sourceSlots: [cardsService.getSlotByKey(cards, deck === 'spades' ? 'ace' : 'two')] }),
            derive: computedSlot => ({ size: (cardsService.getSlotByKey(cards, computedSlot.key === 'spades' ? 'ace' : 'two').entity?.rank ?? 0) * 10 }),
        });
        const ranksByDeckService = ranksByDeckComputedService.computedCollectionService;
        const ranksByDeck = ranksByDeckComputedService.createComputedStoreSlot(db);
        const spadesSize = ranksByDeckService.columnSlotService.holdColumn(ranksByDeckService.holdSlotByKey(ranksByDeck, 'spades'), 'size');
        const seen: number[] = [];
        effectService.createAndRunEffect(db, () => { seen.push(spadesSize.value as number); }, [], [spadesSize]);

        updateCard('two', { rank: 9 });
        db.flush();
        updateCard('ace', { rank: 3 });
        db.flush();

        expect(seen).toEqual([10, 30]);
    });
});
