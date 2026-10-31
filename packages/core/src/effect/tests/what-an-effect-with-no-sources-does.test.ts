import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';

type TCard = { id: string; title: string };

describe('what an effect with no sources does', () => {
    it('subscribes to nothing and holds nothing', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.holdSlotByKey(cards, 'c1');

        const effect = OIMEffectService.INSTANCE.createEffect(db, () => undefined);

        expect(effect.allRootSlots).toHaveLength(0);
        expect(effect.sourceComputeds).toHaveLength(0);
        expect(effect.sourceTracker).toBeUndefined();
        expect(card.effects ?? []).toHaveLength(0);
        expect(card.holdCount).toBe(1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('never runs on its own, whatever is written, and runs once when asked to', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        let runs = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { runs++; });

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        expect(runs).toBe(0);

        const ranAtOnce = OIMEffectService.INSTANCE.createAndRunEffect(db, () => { runs++; });
        expect(runs).toBe(1);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        OIMEffectService.INSTANCE.disposeEffect(ranAtOnce);
    });
});
