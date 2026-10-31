import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import { createOIMSingleSourceTrackingComputedService } from '../../computed/createOIMSingleSourceTrackingComputedService';

type TCard = { id: string; title: string; rank: number };

const createFixture = () => {
    const db = new OIMDB();
    const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardService.createStoreSlot(db);
    const ace = cardService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'Ace', rank: 1 });
    const two = cardService.writeSlotContentByKey(cards, 'b', { id: 'b', title: 'Two', rank: 2 });
    const three = cardService.writeSlotContentByKey(cards, 'c', { id: 'c', title: 'Three', rank: 3 });
    const four = cardService.writeSlotContentByKey(cards, 'd', { id: 'd', title: 'Four', rank: 4 });
    db.flush();
    return { db, ace, two, three, four };
};

describe('what a tracked body depends on by reading', () => {
    it('wakes on a source-tracking computed it read through value', () => {
        const { db, ace } = createFixture();
        const titleService = createOIMSingleSourceTrackingComputedService<string>({
            derive: () => ace.entity?.title ?? '',
            initialValue: '',
        });
        const title = titleService.computedSingleSlotService.holdSingleSlot(titleService.createComputedStoreSlot(db));
        const seen: string[] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            seen.push(title.value);
        });
        ace.updateEntity({ title: 'King' });
        db.flush();
        expect(seen).toEqual(['Ace', 'King']);
    });

    it('depends on the computed it read and not on the computeds that computed reads', () => {
        const { db, ace } = createFixture();
        const rankService = createOIMSingleComputedService<number>({
            createSources: () => ({ sourceSlots: [ace] }),
            derive: () => ace.entity?.rank ?? 0,
            initialValue: 0,
        });
        const rank = rankService.computedSingleSlotService.holdSingleSlot(rankService.createComputedStoreSlot(db));
        const doubledService = createOIMSingleComputedService<number>({
            createSources: () => ({ sourceComputeds: [rank] }),
            derive: () => rank.value * 2,
            initialValue: 0,
        });
        const doubled = doubledService.computedSingleSlotService.holdSingleSlot(doubledService.createComputedStoreSlot(db));
        const seen: number[] = [];
        const effect = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            seen.push(doubled.value);
        });
        expect(effect.sourceComputeds).toEqual([doubled]);
        ace.updateEntity({ rank: 5 });
        db.flush();
        expect(seen).toEqual([2, 10]);
        expect(effect.sourceComputeds).toEqual([doubled]);
    });

    it('subscribes once to a slot it read twice with other reads between', () => {
        const { db, ace, two, three, four } = createFixture();
        let runs = 0;
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            runs++;
            return void [ace.entity, two.entity, three.entity, four.entity, ace.entity, three.entity, ace.entity];
        });
        expect(ace.effects?.length).toBe(1);
        expect(two.effects?.length).toBe(1);
        ace.updateEntity({ title: 'King' });
        db.flush();
        expect(runs).toBe(2);
        expect(ace.effects?.length).toBe(1);
    });
});
