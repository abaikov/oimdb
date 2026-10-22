import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';

type Card = { id: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 1 });
    db.flush();
    const slot = cardsService.getSlotByKey(cards, 'c1');
    const rankComputedService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const rank = rankComputedService.createComputedStoreSlot(db, () => slot.entity?.rank ?? -1, () => ({ sourceSlots: [slot] }));
    const rankSlot = rankComputedService.computedCollectionService.getSlotByKey(rank, undefined);
    return { db, effectService, cardsService, cards, slot, rankSlot };
};

describe('an effect reaching a root through a derivation', () => {
    it('holds it, so a removal cannot release it under the subscription', () => {
        const { db, effectService, cardsService, slot, rankSlot } = createFixture();
        const effect = effectService.createEffect(db, [], [rankSlot], () => undefined);

        expect(slot.holdCount).toBe(2);
        expect(slot.effects?.length).toBe(1);

        cardsService.slotContentService.deleteEntity(slot);
        expect(oimIsSlotReleased(slot)).toBe(false);

        effectService.disposeEffect(effect);
        db.flush();
        expect(oimIsSlotReleased(slot)).toBe(true);
    });

    it('detaches without throwing, and gives back every hold it took', () => {
        const { db, effectService, cardsService, cards, slot, rankSlot } = createFixture();
        const held = cardsService.holdSlotByKey(cards, 'c1');
        const effect = effectService.createEffect(db, [held], [rankSlot], () => undefined);
        expect(slot.holdCount).toBe(4);
        expect(slot.effects?.length).toBe(2);

        held.owner.unholdSlot(held);
        cardsService.slotContentService.deleteEntity(slot);
        expect(oimIsSlotReleased(slot)).toBe(false);

        expect(() => { effectService.disposeEffect(effect); }).not.toThrow();
        db.flush();
        expect(slot.holdCount).toBe(0);
    });
});
