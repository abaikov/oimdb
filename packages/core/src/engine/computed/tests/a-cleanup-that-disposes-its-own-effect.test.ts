import { OIMDB, OIMEffectService, createOIMEntityService } from '../../../index';

type TCard = { id: string; n: number };

describe('a cleanup that disposes its own effect', () => {
    it('stops the body that would have run after it', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 's', n: 0 });
        const bodies: number[] = [];
        const effect = effectService.createEffect(db, [card], [], () => {
            const n = card.entity?.n ?? -1;
            bodies.push(n);
            return () => { if (n >= 1) effectService.disposeEffect(effect); };
        });
        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 's')!, { n: 1 });
        db.flush();
        bodies.length = 0;

        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 's')!, { n: 2 });
        db.flush();

        expect(bodies).toEqual([]);
    });
});
