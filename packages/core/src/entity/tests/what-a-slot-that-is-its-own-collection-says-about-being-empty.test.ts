import { OIMDB } from '../../db/OIMDB';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { isOIMSlotEmpty } from '../../slot/utils/isOIMSlotEmpty';
import { createOIMEntityContentService } from '../createOIMEntityContentService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';

type TCard = { id: string; title: string };

const single = (db: OIMDB, entity: TCard) => {
    const singleService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TCard>() });
    const singleStore = singleService.createStoreSlot(db);
    singleService.writeSingleSlotContent(singleStore, entity);
    return { singleService, singleStore };
};

const filed = (db: OIMDB, entity: TCard): TOIMEntitySlot<TCard, TOIMStoreKey> => {
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, TOIMStoreKey>() });
    const cards = cardsService.createStoreSlot(db);
    cardsService.writeSlotContentByKey(cards, entity.id, entity);
    db.flush();
    return cardsService.getSlotByKey(cards, entity.id);
};

describe('a slot that is its own collection, asked whether it is empty', () => {
    it('answers what the collection answers about the same row', () => {
        const db = new OIMDB();
        const card = { id: 'c1', title: 'Ace' };

        const asItsOwnSingle = single(db, card);
        const asItsOwn: TOIMEntityContentSlot<TCard> = asItsOwnSingle.singleService.getSingleSlot(asItsOwnSingle.singleStore);
        const asFiled = filed(new OIMDB(), card);

        expect(isOIMSlotEmpty(asItsOwn)).toBe(isOIMSlotEmpty(asFiled));
        expect(isOIMSlotEmpty(asItsOwn)).toBe(false);
    });

    it('answers the checker it was handed, not a field nobody writes', () => {
        const db = new OIMDB();
        const nothingIsEmpty = { isEmpty: (): boolean => false };
        const everythingIsEmpty = { isEmpty: (): boolean => true };

        const openService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TCard>({ slotEmptinessPolicy: nothingIsEmpty }) });
        const open = openService.createStoreSlot(db);
        openService.writeSingleSlotContent(open, { id: 'c1', title: 'Ace' });
        const shutService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TCard>({ slotEmptinessPolicy: everythingIsEmpty }) });
        const shut = shutService.createStoreSlot(db);
        shutService.writeSingleSlotContent(shut, { id: 'c2', title: 'King' });

        expect(isOIMSlotEmpty(openService.getSingleSlot(open))).toBe(false);
        expect(isOIMSlotEmpty(shutService.getSingleSlot(shut))).toBe(true);
    });

    it('settles again on a write, so the answer is never the one from birth', () => {
        const db = new OIMDB();
        let titleDecides = false;
        const titleIsWhatCounts = {
            isEmpty: (slot: TOIMEntityContentSlot): boolean =>
                titleDecides && (slot as TOIMEntityContentSlot<TCard>).entity?.title === 'void',
        };

        const cardService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TCard>({ slotEmptinessPolicy: titleIsWhatCounts }) });
        const cardStore = cardService.createStoreSlot(db);
        cardService.writeSingleSlotContent(cardStore, { id: 'c1', title: 'Ace' });
        const cardSlot = cardService.holdSingleSlot(cardStore);
        expect(isOIMSlotEmpty(cardSlot)).toBe(false);

        titleDecides = true;
        cardService.slotContentService.updateEntity(cardSlot, { title: 'void' });
        db.flush();

        expect(isOIMSlotEmpty(cardSlot)).toBe(true);
    });
});
