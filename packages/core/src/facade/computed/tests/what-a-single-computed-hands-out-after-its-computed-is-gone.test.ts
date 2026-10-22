import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { oimSameValueZeroGuard } from '../../../engine/slot/utils/oimSameValueZeroGuard';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMSingleSlotStore } from '../../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type Card = { id: string; rank: number };

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const sourceSlots: TOIMEntitySlot<Card, TOIMStoreKey>[] = [];
    const topRankComputedService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const topRank = topRankComputedService.createComputedStoreSlot(
        db,
        () => cardsService.getSlotByKey(cards, 'a').entity?.rank ?? -1,
        () => {
            const card = cardsService.getSlotByKey(cards, 'a');
            sourceSlots.push(card);
            return { sourceSlots: [card] };
        },
    );
    return {
        db, effectService, cardsService, cards, topRankService: topRankComputedService.computedCollectionService, topRank,
        sourceSlots, builds: () => sourceSlots.length,
    };
};

describe('a single computed is a factory that outlives the computed it hands out', () => {
    it('hands the same computed back while something holds it', () => {
        const { topRankService, topRank, builds } = createFixture();
        const first = topRankService.holdSlotByKey(topRank, undefined);
        expect(topRankService.getSlotByKey(topRank, undefined)).toBe(first);
        expect(topRankService.holdSlotByKey(topRank, undefined)).toBe(first);
        expect(builds()).toBe(1);
    });

    it('keeps the computed until the last of several holds is given back', () => {
        const { topRankService, topRank } = createFixture();
        const first = topRankService.holdSlotByKey(topRank, undefined);
        topRankService.holdSlotByKey(topRank, undefined);
        first.owner.unholdSlot(first);
        expect(oimIsSlotReleased(first)).toBe(false);
        first.owner.unholdSlot(first);
        expect(oimIsSlotReleased(first)).toBe(true);
    });

    it('hands out a new live computed once the previous one is gone', () => {
        const { db, cardsService, cards, topRankService, topRank, builds } = createFixture();
        const first = topRankService.holdSlotByKey(topRank, undefined);
        first.owner.unholdSlot(first);
        expect(oimIsSlotReleased(first)).toBe(true);

        const second = topRankService.holdSlotByKey(topRank, undefined);
        expect(second).not.toBe(first);
        expect(oimIsSlotReleased(second)).toBe(false);
        expect(builds()).toBe(2);

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 7 });
        db.flush();
        expect(second.computedValueService.getValueForSlot(second)).toBe(7);
    });

    it('lets a computed nobody held go at the next flush, and builds a new one after', () => {
        const { db, topRankService, topRank, builds } = createFixture();
        const first = topRankService.getSlotByKey(topRank, undefined);
        expect(oimIsSlotReleased(first)).toBe(false);
        db.flush();
        expect(oimIsSlotReleased(first)).toBe(true);

        const second = topRankService.getSlotByKey(topRank, undefined);
        expect(second).not.toBe(first);
        expect(builds()).toBe(2);
    });

    it('keeps a computed an effect reads after its hold is given back, and lets it go with the effect', () => {
        const { db, effectService, cardsService, cards, topRankService, topRank } = createFixture();
        const first = topRankService.holdSlotByKey(topRank, undefined);
        let seen = 0;
        const effect = effectService.createEffect(db, [], [first], () => { seen = first.computedValueService.getValueForSlot(first); });
        first.owner.unholdSlot(first);
        expect(oimIsSlotReleased(first)).toBe(false);

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 3 });
        db.flush();
        expect(seen).toBe(3);

        effectService.disposeEffect(effect);
        db.flush();
        expect(oimIsSlotReleased(first)).toBe(true);
        expect(topRankService.getSlotByKey(topRank, undefined)).not.toBe(first);
    });

    it('gives its sources back when the computed it built goes', () => {
        const { db, topRankService, topRank, sourceSlots } = createFixture();
        const first = topRankService.holdSlotByKey(topRank, undefined);
        db.flush();
        const source = sourceSlots[0];
        expect(oimIsSlotReleased(source)).toBe(false);
        first.owner.unholdSlot(first);
        expect(oimIsSlotReleased(source)).toBe(true);
    });

    it('refuses a late give-back on a computed that is already gone', () => {
        const { topRankService, topRank } = createFixture();
        const first = topRankService.holdSlotByKey(topRank, undefined);
        first.owner.unholdSlot(first);
        const second = topRankService.holdSlotByKey(topRank, undefined);
        expect(() => first.owner.unholdSlot(first)).toThrow(/This identity was released/);
        expect(oimIsSlotReleased(second)).toBe(false);
        expect(topRankService.getSlotByKey(topRank, undefined)).toBe(second);
    });
});
