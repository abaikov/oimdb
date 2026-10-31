import { OIM_ACTIVE_SOURCE_TRACKER } from '../../computed/constants/OIM_ACTIVE_SOURCE_TRACKER';
import type { OIMSourceTracker } from '../../computed/OIMSourceTracker';
import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { entitySlotOf } from '../../../tests/support/entitySlotOf';

type TCard = { id: string; rank: number; label: string; note: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const slot = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', rank: 1, label: 'ace', note: '' });
    db.flush();
    const shownColumns = cardsService.columnSlotService.getColumnGroup(['rank', 'label']);
    const groupSlot = cardsService.columnSlotService.holdColumnGroup(slot, shownColumns);
    let runs = 0;
    const effect = OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, [groupSlot]);
    return { db, cardsService, cards, slot, shownColumns, groupSlot, effect, runs: () => runs };
};

describe('what a column group slot hears', () => {
    it('is one key per set of names, whatever their order or repeats', () => {
        const { cardsService, shownColumns } = createFixture();
        const sameColumns = cardsService.columnSlotService.getColumnGroup(['label', 'rank', 'label']);
        expect(sameColumns.key).toBe(shownColumns.key);
        expect(sameColumns.columnNames).toEqual(['label', 'rank']);
        expect(shownColumns.columnNames).toEqual(['label', 'rank']);
    });

    it('holds one slot per key, whichever descriptor of that key is handed in', () => {
        const { cardsService, slot, groupSlot } = createFixture();
        expect(cardsService.columnSlotService.holdColumnGroup(slot, cardsService.columnSlotService.getColumnGroup(['rank', 'label']))).toBe(groupSlot);
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
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', rank: 2, label: 'ace', note: '' });
        db.flush();
        expect(runs()).toBe(1);
    });

    it('is a slot of its own, beside the column slots of the same card', () => {
        const { cardsService, slot, groupSlot } = createFixture();
        const labelSlot = cardsService.columnSlotService.holdColumn(slot, 'label');
        expect(labelSlot).not.toBe(groupSlot);
        expect(groupSlot.carrierSlot).toBe(slot);
        cardsService.columnSlotService.unholdColumn(labelSlot);
    });

    it('is given back like a column slot and leaves the card unheld', () => {
        const { db, cardsService, groupSlot, effect } = createFixture();
        OIMEffectService.INSTANCE.disposeEffect(effect);
        cardsService.columnSlotService.unholdColumn(groupSlot);
        db.flush();
        expect(oimIsSlotReleased(groupSlot)).toBe(true);
    });

    it('hands back the held group slot through the get door, and a minted one goes at the next flush when nothing holds it', () => {
        const { db, cardsService, cards, slot, shownColumns, groupSlot } = createFixture();
        expect(cardsService.columnSlotService.getColumnGroupSlot(slot, shownColumns)).toBe(groupSlot);
        const other = cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', rank: 2, label: 'two', note: '' });
        db.flush();
        const mintedSlot = cardsService.columnSlotService.getColumnGroupSlot(other, shownColumns);
        expect(cardsService.columnSlotService.getColumnGroupSlot(other, shownColumns)).toBe(mintedSlot);
        expect(oimIsSlotReleased(mintedSlot)).toBe(false);
        db.flush();
        expect(oimIsSlotReleased(mintedSlot)).toBe(true);
    });

    it('keeps a group slot read through the get door while a tracking effect reads it', () => {
        const { db, cardsService, cards, shownColumns } = createFixture();
        const other = cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', rank: 2, label: 'two', note: '' });
        db.flush();
        const seen: string[] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            (OIM_ACTIVE_SOURCE_TRACKER.sourceTracker as OIMSourceTracker).readSourceSlot(cardsService.columnSlotService.getColumnGroupSlot(other, shownColumns));
            seen.push(entitySlotOf(other).content?.label ?? '');
        });
        db.flush();
        cardsService.slotContentService.updateEntity(other, { note: 'unseen' });
        db.flush();
        cardsService.slotContentService.updateEntity(other, { label: 'deuce' });
        db.flush();
        expect(seen).toEqual(['two', 'deuce']);
    });
});
