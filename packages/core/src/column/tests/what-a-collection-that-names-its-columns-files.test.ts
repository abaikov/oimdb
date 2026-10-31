import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; rank: number; label: string; note: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>(), columnNames: ['rank', 'label'] });
    const cards = cardsService.createStoreSlot(db);
    const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', rank: 1, label: 'ace', note: '' });
    db.flush();
    return { db, cardsService, cards, slot };
};

describe('what a collection that names its columns files', () => {
    it('wakes a named column and a group of named columns, and not for a column outside them', () => {
        const { db, cardsService, slot } = createFixture();
        let rankRuns = 0;
        let groupRuns = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { rankRuns++; }, [cardsService.columnSlotService.holdColumn(slot, 'rank')]);
        OIMEffectService.INSTANCE.createEffect(db, () => {
            groupRuns++;
        }, [cardsService.columnSlotService.holdColumnGroup(slot, cardsService.columnSlotService.getColumnGroup(['rank', 'label']))]);
        db.flush();
        cardsService.slotContentService.updateEntity(slot, { note: 'seen' });
        db.flush();
        cardsService.slotContentService.updateEntity(slot, { label: 'king' });
        db.flush();
        cardsService.slotContentService.updateEntity(slot, { rank: 13 });
        db.flush();
        expect({ rankRuns, groupRuns }).toEqual({ rankRuns: 1, groupRuns: 2 });
    });

    it('refuses a slot for a column it was not given', () => {
        const { cardsService, slot } = createFixture();
        // @ts-expect-error 'note' is not among the columns
        expect(() => cardsService.columnSlotService.holdColumn(slot, 'note')).toThrow('"note" is not among the columns');
    });

    it('refuses a group that carries a column it was not given', () => {
        const { cardsService, slot } = createFixture();
        // @ts-expect-error 'note' is not among the columns
        const group = cardsService.columnSlotService.getColumnGroup(['rank', 'note']);
        expect(() => cardsService.columnSlotService.holdColumnGroup(slot, group)).toThrow('"note" is not among the columns');
    });

    it('gives a column slot back and leaves the row free to go', () => {
        const { db, cardsService, slot } = createFixture();
        const rankSlot = cardsService.columnSlotService.holdColumn(slot, 'rank');
        const groupSlot = cardsService.columnSlotService.holdColumnGroup(slot, cardsService.columnSlotService.getColumnGroup(['label', 'rank']));
        cardsService.columnSlotService.unholdColumn(rankSlot);
        cardsService.columnSlotService.unholdColumn(groupSlot);
        db.flush();
        expect(oimIsSlotReleased(rankSlot) && oimIsSlotReleased(groupSlot)).toBe(true);
        expect(slot.columnSlotStore).toBeUndefined();
    });
});
