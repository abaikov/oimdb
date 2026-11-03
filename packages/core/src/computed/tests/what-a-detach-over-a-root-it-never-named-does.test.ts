import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { isOIMSameValueZero } from '../../slot/utils/isOIMSameValueZero';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../createOIMSingleComputedService';

type Card = { id: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card, string>() });
    const cards = cardsService.createStoreSlot(db);
    cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', rank: 1 });
    db.flush();
    const slot = cardsService.getSlotByKey(cards, 'c1');
    const rankComputedService = createOIMSingleComputedService<number>({ sameValueGuard: isOIMSameValueZero });
    const rank = rankComputedService.createStoreSlot(db, () => slot.entity?.rank ?? -1, () => ({ sourceSlots: [slot] }));
    const rankSlot = rankComputedService.getSingleSlot(rank);
    return { db, effectService, cardsService, cards, slot, rankSlot };
};

describe('an effect reaching a root through a derivation', () => {
    it('holds it, so a removal cannot release it under the subscription', () => {
        const { db, effectService, cardsService, slot, rankSlot } = createFixture();
        const effect = effectService.createEffect(db, () => undefined, [], [rankSlot]);

        expect(slot.holdCount).toBe(2);
        expect(slot.effects?.length).toBe(1);

        cardsService.slotContentService.clearSlotContent(slot);
        expect(isOIMSlotReleased(slot)).toBe(false);

        effectService.disposeEffect(effect);
        db.flush();
        expect(isOIMSlotReleased(slot)).toBe(true);
    });

    it('detaches without throwing, and gives back every hold it took', () => {
        const { db, effectService, cardsService, cards, slot, rankSlot } = createFixture();
        const held = cardsService.holdSlotByKey(cards, 'c1');
        const effect = effectService.createEffect(db, () => undefined, [held], [rankSlot]);
        expect(slot.holdCount).toBe(3);
        expect(slot.effects?.length).toBe(1);

        held.owner.unholdSlot(held);
        cardsService.slotContentService.clearSlotContent(slot);
        expect(isOIMSlotReleased(slot)).toBe(false);

        expect(() => { effectService.disposeEffect(effect); }).not.toThrow();
        db.flush();
        expect(slot.holdCount).toBe(0);
    });
});
