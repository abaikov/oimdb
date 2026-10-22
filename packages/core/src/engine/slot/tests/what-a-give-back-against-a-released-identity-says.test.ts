import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

const releasedCard = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
    db.flush();
    cardsService.slotContentService.deleteEntity(card);
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
