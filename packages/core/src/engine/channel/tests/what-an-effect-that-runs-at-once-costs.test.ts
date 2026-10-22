import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';

type TCard = { id: string; title: string };

const effectService = OIMEffectService.INSTANCE;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('an effect that runs at once', () => {
    it('runs before any change, where the ordinary one waits', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        let waited = 0;
        let atOnce = 0;
        effectService.createEffect(db, [slot], [], () => { waited++; });
        effectService.createEffectImmediate(db, [slot], [], () => { atOnce++; });

        expect(waited).toBe(0);
        expect(atOnce).toBe(1);
        slot.owner.unholdSlot(slot);
    });

    it('still wakes on the next change, and only once for it', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        let runs = 0;
        effectService.createEffectImmediate(db, [slot], [], () => { runs++; });
        expect(runs).toBe(1);

        cardsService.slotContentService.updateEntity(slot, { title: 'two' });
        db.flush();

        expect(runs).toBe(2);
        slot.owner.unholdSlot(slot);
    });

    it('reads what is already there, which is the whole reason to ask for it', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        const seen: (string | undefined)[] = [];
        effectService.createEffectImmediate(db, [slot], [], () => { seen.push(slot.entity?.title); });

        expect(seen).toEqual(['one']);
        slot.owner.unholdSlot(slot);
    });

    it('gives its teardown back the same way, and stops waking after detach', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        let runs = 0;
        let undone = 0;
        const effect = effectService.createEffectImmediate(db, [slot], [], () => { runs++; return () => { undone++; }; });
        expect(runs).toBe(1);

        effectService.disposeEffect(effect);
        expect(undone).toBe(1);

        cardsService.slotContentService.updateEntity(slot, { title: 'two' });
        db.flush();
        expect(runs).toBe(1);
        slot.owner.unholdSlot(slot);
    });
});
