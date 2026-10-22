import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMSingleSlotStore } from '../../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string; deck: string; rank: number; title: string };
type TSummary = { topRank: number; titles: string };

function setUp() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const ace = cardsService.slotContentService.upsertEntity(cards, { id: 'ace', deck: 'spades', rank: 1, title: 'Ace' });
    const two = cardsService.slotContentService.upsertEntity(cards, { id: 'two', deck: 'spades', rank: 2, title: 'Two' });
    const summaryComputedService = createOIMComputedService<void, TSummary, TOIMSingleSlotStore<TOIMComputedSlot<TSummary, void>>>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<TSummary, void>>(),
    });
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
    return { db, effectService, cardsService, cards, summaryService: summaryComputedService.computedCollectionService, summary, updateCard };
}

describe('a column of a computed value', () => {
    it('wakes its effect when that field of the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const topRank = summaryService.holdColumn(summaryService.getSlotByKey(summary, undefined), 'topRank');
        const seen: unknown[] = [];
        effectService.createEffectImmediate(db, [], [topRank], () => { seen.push(summaryService.slotContentService.getValueForSlot(summaryService.getSlotByKey(summary, undefined)).topRank); });

        updateCard('two', { rank: 5 });
        db.flush();

        expect(seen).toEqual([2, 5]);
    });

    it('stays silent when another field of the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const topRank = summaryService.holdColumn(summaryService.getSlotByKey(summary, undefined), 'topRank');
        let runs = 0;
        effectService.createEffectImmediate(db, [], [topRank], () => { runs++; });

        updateCard('ace', { title: 'Ace of Spades' });
        db.flush();

        expect(runs).toBe(1);
        expect(topRank.value).toBe(2);
    });

    it('wakes a column group once when any of its fields changes, and not for the others', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const group = summaryService.holdColumnGroup(summaryService.getSlotByKey(summary, undefined), summaryService.getColumnGroup(['topRank', 'titles']));
        let runs = 0;
        effectService.createEffectImmediate(db, [], [group], () => { runs++; });

        updateCard('ace', { title: 'Ace of Spades' });
        db.flush();
        updateCard('ace', { deck: 'hearts' });
        db.flush();

        expect(runs).toBe(2);
        expect(group.value).toEqual(['Ace of Spades,Two', 2]);
    });

    it('wakes the any-column slot whenever the derived value changes', () => {
        const { db, effectService, updateCard, summaryService, summary } = setUp();
        const anyColumn = summaryService.holdAnyColumn(summaryService.getSlotByKey(summary, undefined));
        let runs = 0;
        effectService.createEffectImmediate(db, [], [anyColumn], () => { runs++; });

        updateCard('ace', { title: 'Ace of Spades' });
        db.flush();
        updateCard('ace', { deck: 'hearts' });
        db.flush();

        expect(runs).toBe(3);
    });

    it('keeps its computed slot alive while held and is released after the last hold goes', () => {
        const { db, summaryService, summary } = setUp();
        const computedSlot = summaryService.getSlotByKey(summary, undefined);
        const topRank = summaryService.holdColumn(computedSlot, 'topRank');
        db.flush();
        expect(oimIsSlotReleased(computedSlot)).toBe(false);

        summaryService.unholdColumn(topRank);
        db.flush();

        expect(oimIsSlotReleased(topRank)).toBe(true);
    });

    it('is a computed slot of the same shape as every other, its carrier the only source', () => {
        const { summaryService, summary } = setUp();
        const computedSlot = summaryService.getSlotByKey(summary, undefined);
        const topRank = summaryService.holdColumn(computedSlot, 'topRank');

        expect(Object.keys(topRank).sort()).toEqual(Object.keys(computedSlot).sort());
        expect(topRank.sourceComputeds).toEqual([computedSlot]);
        summaryService.unholdColumn(topRank);
    });

    it('reads its field from each key of a computed collection on its own', () => {
        const { db, effectService, updateCard, cardsService, cards } = setUp();
        const ranksByDeckComputedService = createOIMComputedService<string, { size: number }>({
            createSources: deck => ({ sourceSlots: [cardsService.getSlotByKey(cards, deck === 'spades' ? 'ace' : 'two')] }),
            derive: computedSlot => ({ size: (cardsService.getSlotByKey(cards, computedSlot.key === 'spades' ? 'ace' : 'two').entity?.rank ?? 0) * 10 }),
        });
        const ranksByDeckService = ranksByDeckComputedService.computedCollectionService;
        const ranksByDeck = ranksByDeckComputedService.createComputedStoreSlot(db);
        const spadesSize = ranksByDeckService.holdColumn(ranksByDeckService.holdSlotByKey(ranksByDeck, 'spades'), 'size');
        const seen: number[] = [];
        effectService.createEffectImmediate(db, [], [spadesSize], () => { seen.push(spadesSize.value as number); });

        updateCard('two', { rank: 9 });
        db.flush();
        updateCard('ace', { rank: 3 });
        db.flush();

        expect(seen).toEqual([10, 30]);
    });
});
