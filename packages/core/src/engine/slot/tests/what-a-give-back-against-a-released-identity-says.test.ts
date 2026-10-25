import { OIMDB } from '../../../factories/OIMDB';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const releasedCard = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
    db.flush();
    cardsService.slotContentService.clearSlotContent(card);
    expect(oimIsSlotReleased(card)).toBe(true);
    return card;
};

describe('a give-back handed an identity the engine has already released', () => {
    it('does not send the caller after a double give-back that never happened', () => {
        const card = releasedCard();

        expect(() => card.owner.unholdSlot(card)).not.toThrow(/this slot is not held/);
    });

    it('says what the hold and the subscription say, so one release reads one way', () => {
        const card = releasedCard();

        const refusals = [
            () => card.owner.unholdSlot(card),
            () => card.owner.holdSlot(card),
        ].map(act => {
            try {
                act();
                return 'nothing was refused';
            } catch (refusal) {
                return refusal instanceof Error ? refusal.message.split(':')[0] : String(refusal);
            }
        });

        expect(refusals).toEqual(['This identity was released', 'This identity was released']);
    });
});
