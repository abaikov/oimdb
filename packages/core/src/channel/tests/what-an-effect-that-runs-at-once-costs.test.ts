import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const effectService = OIMEffectService.INSTANCE;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('an effect that runs at once', () => {
    it('runs before any change, where the ordinary one waits', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        let waited = 0;
        let atOnce = 0;
        effectService.createEffect(db, () => { waited++; }, [slot]);
        effectService.createAndRunEffect(db, () => { atOnce++; }, [slot]);

        expect(waited).toBe(0);
        expect(atOnce).toBe(1);
        slot.owner.unholdSlot(slot);
    });

    it('still wakes on the next change, and only once for it', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        let runs = 0;
        effectService.createAndRunEffect(db, () => { runs++; }, [slot]);
        expect(runs).toBe(1);

        cardsService.slotContentService.updateEntity(slot, { title: 'two' });
        db.flush();

        expect(runs).toBe(2);
        slot.owner.unholdSlot(slot);
    });

    it('reads what is already there, which is the whole reason to ask for it', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        const seen: (string | undefined)[] = [];
        effectService.createAndRunEffect(db, () => { seen.push(slot.entity?.title); }, [slot]);

        expect(seen).toEqual(['one']);
        slot.owner.unholdSlot(slot);
    });

    it('gives its teardown back the same way, and stops waking after detach', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        const slot = cardsService.holdSlotByKey(cards, 'c1');

        let runs = 0;
        let undone = 0;
        const effect = effectService.createAndRunEffect(db, () => { runs++; return () => { undone++; }; }, [slot]);
        expect(runs).toBe(1);

        effectService.disposeEffect(effect);
        expect(undone).toBe(1);

        cardsService.slotContentService.updateEntity(slot, { title: 'two' });
        db.flush();
        expect(runs).toBe(1);
        slot.owner.unholdSlot(slot);
    });
});
