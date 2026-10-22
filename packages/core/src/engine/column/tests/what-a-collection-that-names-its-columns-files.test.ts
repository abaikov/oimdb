import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; rank: number; label: string; note: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard, 'rank' | 'label'>(db, {
        keyOf: card => card.id,
        columnNames: ['rank', 'label'],
    });
    const cards = cardsService.createStoreSlot(db);
    const slot = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 1, label: 'ace', note: '' });
    db.flush();
    return { db, cardsService, cards, slot };
};

describe('what a collection that names its columns files', () => {
    it('wakes a named column and a group of named columns, and not for a column outside them', () => {
        const { db, cardsService, slot } = createFixture();
        let rankRuns = 0;
        let groupRuns = 0;
        OIMEffectService.INSTANCE.createEffect(db, [cardsService.holdColumn(slot, 'rank')], [], () => { rankRuns++; });
        OIMEffectService.INSTANCE.createEffect(db, [cardsService.holdColumnGroup(slot, cardsService.getColumnGroup(['rank', 'label']))], [], () => {
            groupRuns++;
        });
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
        expect(() => cardsService.holdColumn(slot, 'note')).toThrow('"note" is not among the columns');
    });

    it('refuses a group that carries a column it was not given', () => {
        const { cardsService, slot } = createFixture();
        // @ts-expect-error 'note' is not among the columns
        const group = cardsService.getColumnGroup(['rank', 'note']);
        expect(() => cardsService.holdColumnGroup(slot, group)).toThrow('"note" is not among the columns');
    });

    it('gives a column slot back and leaves the row free to go', () => {
        const { db, cardsService, slot } = createFixture();
        const rankSlot = cardsService.holdColumn(slot, 'rank');
        const groupSlot = cardsService.holdColumnGroup(slot, cardsService.getColumnGroup(['label', 'rank']));
        cardsService.unholdColumn(rankSlot);
        cardsService.unholdColumn(groupSlot);
        db.flush();
        expect(oimIsSlotReleased(rankSlot) && oimIsSlotReleased(groupSlot)).toBe(true);
        expect(slot.columnSlotStore).toBeUndefined();
    });
});
