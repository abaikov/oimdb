import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; rank: number; label: string; note: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const slot = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 1, label: 'ace', note: '' });
    db.flush();
    const rowColumns = cardsService.getColumnGroup(['rank', 'label']);
    const groupSlot = cardsService.holdColumnGroup(slot, rowColumns);
    let runs = 0;
    const effect = OIMEffectService.INSTANCE.createEffect(db, [groupSlot], [], () => { runs++; });
    return { db, cardsService, cards, slot, rowColumns, groupSlot, effect, runs: () => runs };
};

describe('what a column group slot hears', () => {
    it('is one key per set of names, whatever their order or repeats', () => {
        const { cardsService, rowColumns } = createFixture();
        const sameColumns = cardsService.getColumnGroup(['label', 'rank', 'label']);
        expect(sameColumns.key).toBe(rowColumns.key);
        expect(sameColumns.columnNames).toEqual(['label', 'rank']);
        expect(rowColumns.columnNames).toEqual(['label', 'rank']);
    });

    it('holds one slot per key, whichever descriptor of that key is handed in', () => {
        const { cardsService, slot, groupSlot } = createFixture();
        expect(cardsService.holdColumnGroup(slot, cardsService.getColumnGroup(['rank', 'label']))).toBe(groupSlot);
    });

    it('wakes once for a patch of one of its columns', () => {
        const { db, cardsService, slot, runs } = createFixture();
        cardsService.slotContentService.updateEntity(slot, { label: 'king' });
        db.flush();
        expect(runs()).toBe(1);
    });

    it('wakes once for a patch of both of its columns in one write', () => {
        const { db, cardsService, slot, runs } = createFixture();
        cardsService.slotContentService.updateEntity(slot, { label: 'king', rank: 13 });
        db.flush();
        expect(runs()).toBe(1);
    });

    it('does not wake for a patch of a column outside it', () => {
        const { db, cardsService, slot, runs } = createFixture();
        cardsService.slotContentService.updateEntity(slot, { note: 'seen' });
        db.flush();
        expect(runs()).toBe(0);
    });

    it('wakes for a whole-value write that carries one of its columns', () => {
        const { db, cardsService, cards, runs } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 2, label: 'ace', note: '' });
        db.flush();
        expect(runs()).toBe(1);
    });

    it('is a slot of its own, beside the column slots of the same row', () => {
        const { cardsService, slot, groupSlot } = createFixture();
        const labelSlot = cardsService.holdColumn(slot, 'label');
        expect(labelSlot).not.toBe(groupSlot);
        expect(groupSlot.carrierSlot).toBe(slot);
        cardsService.unholdColumn(labelSlot);
    });

    it('is given back like a column slot and leaves the row unheld', () => {
        const { db, cardsService, groupSlot, effect } = createFixture();
        OIMEffectService.INSTANCE.disposeEffect(effect);
        cardsService.unholdColumn(groupSlot);
        db.flush();
        expect(oimIsSlotReleased(groupSlot)).toBe(true);
    });
});
