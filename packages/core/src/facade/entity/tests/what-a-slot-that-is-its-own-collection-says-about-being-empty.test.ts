import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import { oimIsSlotEmpty } from '../../../engine/slot/utils/oimIsSlotEmpty';

type TCard = { id: string; title: string };

const single = (db: OIMDB, entity: TCard) => {
    const singleService = createOIMSingleEntityService<TCard>(db);
    const singleStore = singleService.createStoreSlot(db);
    singleService.slotContentService.upsertEntity(singleStore, entity);
    return { singleService, singleStore };
};

const filed = (db: OIMDB, entity: TCard): TOIMEntitySlot<TCard, TOIMStoreKey> => {
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, entity);
    db.flush();
    return cardsService.getSlotByKey(cards, entity.id);
};

describe('a slot that is its own collection, asked whether it is empty', () => {
    it('answers what the collection answers about the same row', () => {
        const db = new OIMDB();
        const card = { id: 'c1', title: 'Ace' };

        const asItsOwnSingle = single(db, card);
        const asItsOwn: TOIMEntitySlot<TCard, void> = asItsOwnSingle.singleService.getSingleSlot(asItsOwnSingle.singleStore);
        const asFiled = filed(new OIMDB(), card);

        expect(oimIsSlotEmpty(asItsOwn)).toBe(oimIsSlotEmpty(asFiled));
        expect(oimIsSlotEmpty(asItsOwn)).toBe(false);
    });

    it('answers the checker it was handed, not a field nobody writes', () => {
        const db = new OIMDB();
        const nothingIsEmpty = { isEmpty: (): boolean => false };
        const everythingIsEmpty = { isEmpty: (): boolean => true };

        const openService = createOIMSingleEntityService<TCard>(db, { slotEmptiness: nothingIsEmpty });
        const open = openService.createStoreSlot(db);
        openService.slotContentService.upsertEntity(open, { id: 'c1', title: 'Ace' });
        const shutService = createOIMSingleEntityService<TCard>(db, { slotEmptiness: everythingIsEmpty });
        const shut = shutService.createStoreSlot(db);
        shutService.slotContentService.upsertEntity(shut, { id: 'c2', title: 'King' });

        expect(oimIsSlotEmpty(openService.getSingleSlot(open))).toBe(false);
        expect(oimIsSlotEmpty(shutService.getSingleSlot(shut))).toBe(true);
    });

    it('settles again on a write, so the answer is never the one from birth', () => {
        const db = new OIMDB();
        let titleDecides = false;
        const titleIsWhatCounts = {
            isEmpty: (slot: TOIMEntitySlot): boolean =>
                titleDecides && (slot as TOIMEntitySlot<TCard>).entity?.title === 'void',
        };

        const cardService = createOIMSingleEntityService<TCard>(db, { slotEmptiness: titleIsWhatCounts });
        const cardStore = cardService.createStoreSlot(db);
        cardService.slotContentService.upsertEntity(cardStore, { id: 'c1', title: 'Ace' });
        const cardSlot = cardService.holdSingleSlot(cardStore);
        expect(oimIsSlotEmpty(cardSlot)).toBe(false);

        titleDecides = true;
        cardService.slotContentService.updateEntity(cardSlot, { title: 'void' });
        db.flush();

        expect(oimIsSlotEmpty(cardSlot)).toBe(true);
    });
});
