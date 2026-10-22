import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';

type TCard = { id: string; rank: number };

function createFixture() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 1 });
    db.flush();
    const card = cardsService.getSlotByKey(cards, 'c1');
    const doubledService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const doubledStore = doubledService.createComputedStoreSlot(
        db,
        () => (card.entity?.rank ?? 0) * 2,
        () => ({ sourceSlots: [card] }),
    );
    const doubled = doubledService.computedCollectionService.holdSlotByKey(doubledStore, undefined);
    return { db, effectService, cardsService, cards, card, doubled };
}

describe('what naming one source on both arms does', () => {
    it('names it once, so the effect files one edge per source', () => {
        const { db, effectService, cardsService, cards, card, doubled } = createFixture();
        let ran = 0;
        const watching = effectService.createEffect(db, [], [doubled], () => { ran++; });
        db.flush();
        const before = ran;

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 2 });
        db.flush();

        expect(ran).toBe(before + 1);

        effectService.disposeEffect(watching);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 3 });
        db.flush();

        expect(ran).toBe(before + 1);
        expect(card.effects === undefined || card.effects.length === 0).toBe(true);
    });

    it('a detach takes the effect off every source it named, even named twice', () => {
        const { db, effectService, cardsService, cards, doubled } = createFixture();
        let ran = 0;
        const watching = effectService.createEffect(db, [doubled], [doubled], () => { ran++; });
        db.flush();
        const before = ran;

        effectService.disposeEffect(watching);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 2 });
        db.flush();

        expect(ran).toBe(before);
        expect(doubled.effects === undefined || doubled.effects.length === 0).toBe(true);
    });

    it('and the body does not run after its own cleanup', () => {
        const { db, effectService, cardsService, cards, doubled } = createFixture();
        const order: string[] = [];
        const watching = effectService.createEffect(db, [doubled], [doubled], () => {
            order.push('body');
            return () => { order.push('cleanup'); };
        });
        db.flush();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 2 });
        db.flush();

        expect(order).toEqual(['body']);

        effectService.disposeEffect(watching);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 3 });
        db.flush();

        expect(order).toEqual(['body', 'cleanup']);
    });
});
