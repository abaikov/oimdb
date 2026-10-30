import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

describe('an effect dispose handed on without its effect', () => {
    it('unsubscribes and gives back its holds when called bare', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.holdSlotByKey(cards, 'c1');

        let runs = 0;
        const effect = effectService.createEffect(db, () => { runs++; }, [card]);
        const disposer: TOIMDisposer = () => { effectService.disposeEffect(effect); };
        card.owner.unholdSlot(card);
        disposer();

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();

        expect(runs).toBe(0);
        expect(oimIsSlotReleased(card)).toBe(true);
    });
});
