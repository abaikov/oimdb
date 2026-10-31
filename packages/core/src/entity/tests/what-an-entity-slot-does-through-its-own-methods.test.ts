import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMEntityContentService } from '../createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { OIMEntitySlot } from '../OIMEntitySlot';

type TCard = { id: string; title: string; rank: number; note?: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardService.createStoreSlot(db);
    const card = cardService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'Ace', rank: 1 }) as unknown as OIMEntitySlot<TCard, string>;
    db.flush();
    return { db, cardService, cards, card };
};

describe('what an entity slot does through its own methods', () => {
    it('writes, patches, deletes and clears its own entity', () => {
        const { db, card } = createFixture();
        expect(card.updateEntity({ title: 'King' })).toBe(card);
        expect(card.entity?.title).toBe('King');
        expect(card.updateEntityColumn('rank', 13)).toBe(card);
        expect(card.entity?.rank).toBe(13);
        expect(card.writeSlotContent({ id: 'c1', title: 'Queen', rank: 12, note: 'x' })).toBe(true);
        expect(card.deleteEntityColumns(['note'])).toBe(card);
        expect(card.entity).toEqual({ id: 'c1', title: 'Queen', rank: 12 });
        card.clearSlotContent();
        db.flush();
        expect(card.entity).toBeUndefined();
    });

    it('wakes a subscriber when told by hand that its entity changed', () => {
        const { db, card } = createFixture();
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, [card]);
        (card.content as TCard).title = 'mutated';
        card.markEntityChanged(['title']);
        db.flush();
        expect(runs).toBe(1);
    });

    it('hands out the same column slots as the column doors of its collection', () => {
        const { cardService, card } = createFixture();
        const columnSlotService = cardService.columnSlotService;
        const group = columnSlotService.getColumnGroup(['title', 'rank']);
        expect(card.getColumn('title')).toBe(columnSlotService.getColumn(card, 'title'));
        expect(card.holdColumn('rank')).toBe(columnSlotService.getColumn(card, 'rank'));
        expect(card.getAnyColumn()).toBe(columnSlotService.getAnyColumn(card));
        expect(card.holdAnyColumn()).toBe(columnSlotService.getAnyColumn(card));
        expect(card.getColumnGroupSlot(group)).toBe(columnSlotService.getColumnGroupSlot(card, group));
        expect(card.holdColumnGroup(group)).toBe(columnSlotService.getColumnGroupSlot(card, group));
    });

    it('holds itself and gives the hold back', () => {
        const { db, cardService, cards } = createFixture();
        const empty = cardService.getSlotByKey(cards, 'c2') as unknown as OIMEntitySlot<TCard, string>;
        empty.holdSlot();
        db.flush();
        expect(oimIsSlotReleased(empty)).toBe(false);
        empty.unholdSlot();
        expect(oimIsSlotReleased(empty)).toBe(true);
    });

    it('becomes a source of a tracked body by being read, with no tracker in sight', () => {
        const { db, card } = createFixture();
        const seen: string[] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            seen.push(card.entity?.title ?? '');
        });
        card.updateEntity({ title: 'King' });
        db.flush();
        expect(seen).toEqual(['Ace', 'King']);
    });

    it('makes a computed a source of a tracked body when its value is read', () => {
        const { db, card } = createFixture();
        const rankService = createOIMSingleComputedService<number>({
            createSources: () => ({ sourceSlots: [card] }),
            derive: () => card.content?.rank ?? 0,
            initialValue: 0,
        });
        const rank = rankService.computedSingleSlotService.holdSingleSlot(rankService.createComputedStoreSlot(db));
        const seen: number[] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            seen.push(rank.value);
        });
        card.updateEntityColumn('rank', 5);
        db.flush();
        expect(seen).toEqual([1, 5]);
    });
});
