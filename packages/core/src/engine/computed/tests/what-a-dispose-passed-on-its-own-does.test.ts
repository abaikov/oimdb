import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

describe('an effect dispose handed on without its effect', () => {
    it('unsubscribes and gives back its holds when called bare', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.holdSlotByKey(cards, 'c1');

        let runs = 0;
        const effect = effectService.createEffect(db, [card], [], () => { runs++; });
        const disposer: TOIMDisposer = () => { effectService.disposeEffect(effect); };
        card.owner.unholdSlot(card);
        disposer();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();

        expect(runs).toBe(0);
        expect(oimIsSlotReleased(card)).toBe(true);
    });
});
