import { OIMDB, OIMEffectService, createOIMEntityService } from '../../../index';

type TCard = { id: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const watched = cardsService.slotContentService.upsertEntity(cards, { id: 'w' });
    const other = cardsService.slotContentService.upsertEntity(cards, { id: 'o' });
    const effect = OIMEffectService.INSTANCE.createEffect(db, [other], [], () => undefined);
    return { cards, watched, effect };
};

describe('what a subscription holds', () => {
    it('takes the hold when the owner files the subscriber, so nothing can subscribe without one', () => {
        const { watched, effect } = createFixture();
        const holdsBefore = watched.holdCount;

        watched.owner.subscribeToSlot(watched, effect, 1);

        expect(watched.holdCount).toBe(holdsBefore + 1);
    });

    it('gives the hold back when the owner unfiles the subscriber', () => {
        const { watched, effect } = createFixture();
        const holdsBefore = watched.holdCount;
        const positionInSlot = watched.owner.subscribeToSlot(watched, effect, 1);

        watched.owner.unsubscribeFromSlot(watched, positionInSlot, effect);

        expect(watched.holdCount).toBe(holdsBefore);
    });

    it('an effect holds each root once, through its subscription', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c' });
        const holdsBefore = card.holdCount;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [card], [], () => undefined);
        expect(card.holdCount).toBe(holdsBefore + 1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(card.holdCount).toBe(holdsBefore);
    });
});
