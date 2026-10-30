import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';

import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMDefaults } from '../../db/OIMDefaults';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string; rank: number };

const columnSlotStoreService = OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue();

const askingEveryColumnItself = (entitySlot: TOIMEntitySlot): boolean => {
    const columnSlotStore = entitySlot.columnSlotStore;
    if (columnSlotStore === undefined) return false;
    for (const column of columnSlotStoreService.getSlots(columnSlotStore)) {
        if (column.holdCount > 0) return true;
        if (column.effects !== undefined && column.effects.length > 0) return true;
    }
    return false;
};

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), columnSlotStoreService });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('a column the store holds is always one something references', () => {
    it('answers as the walk does for a row nobody watches by column', () => {
        const { cardsService, cards } = createFixture();
        const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'alpha', rank: 1 });

        expect(slot.columnSlotStore).toBeUndefined();
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(false);
    });

    it('answers as the walk does while the getter\'s mint is held by the collector', () => {
        const { cardsService, cards } = createFixture();
        const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'alpha', rank: 1 });

        const column = cardsService.columnSlotService.getColumn(slot, 'title');

        expect(column.holdCount).toBe(1);
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(true);
    });

    it('answers as the walk does once the collector gives that frame-length hold back', () => {
        const { cardsService, cards, db } = createFixture();
        const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'alpha', rank: 1 });
        cardsService.columnSlotService.getColumn(slot, 'title');

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        expect(slot.columnSlotStore).toBeUndefined();
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(false);
    });

    it('answers as the walk does on a held column, and after the hold is given back', () => {
        const { cardsService, cards } = createFixture();
        const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'alpha', rank: 1 });

        const column = cardsService.columnSlotService.holdColumn(slot, 'title');
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(true);

        cardsService.columnSlotService.unholdColumn(column);

        expect(slot.columnSlotStore).toBeUndefined();
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(false);
    });

    it('answers as the walk does with two columns on one row, as each reference goes', () => {
        const { cardsService, cards } = createFixture();
        const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'alpha', rank: 1 });

        const title = cardsService.columnSlotService.holdColumn(slot, 'title');
        const rank = cardsService.columnSlotService.holdColumn(slot, 'rank');
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));

        cardsService.columnSlotService.unholdColumn(title);
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(true);

        cardsService.columnSlotService.unholdColumn(rank);
        expect(slot.columnSlotStore).toBeUndefined();
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(false);
    });

    it('answers as the walk does on a column kept only by its subscriber', () => {
        const { cardsService, cards, db } = createFixture();
        const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'alpha', rank: 1 });
        const column = cardsService.columnSlotService.holdColumn(slot, 'title');
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { /* nothing */ }, [column]);
        cardsService.columnSlotService.unholdColumn(column);

        expect(column.effects?.length).toBe(1);
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(true);

        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(slot.columnSlotStore).toBeUndefined();
        expect(slot.columnSlotStore !== undefined).toBe(askingEveryColumnItself(slot));
        expect(slot.columnSlotStore !== undefined).toBe(false);
    });
});
