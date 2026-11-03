import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMColumnGroup } from '../utils/createOIMColumnGroup';

type TCard = { id: string; rank: number; label: string; note: string };

const shownColumns = createOIMColumnGroup(['rank', 'label']);

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>(), columnNames: ['rank', 'label'], columnGroups: [shownColumns] });
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
        OIMEffectService.INSTANCE.createEffect(db, () => { rankRuns++; }, [cardsService.columnSlotService.holdColumnSlot(slot, 'rank')]);
        OIMEffectService.INSTANCE.createEffect(db, () => {
            groupRuns++;
        }, [cardsService.columnSlotService.holdColumnGroupSlot(slot, shownColumns)]);
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
        expect(() => cardsService.columnSlotService.holdColumnSlot(slot, 'note')).toThrow('"note" is not among the columns');
    });

    it('refuses at construction a group that carries a column it was not given', () => {
        expect(() => createOIMSlotCollectionService({
            slotContentService: createOIMEntityContentService<TCard, string>(),
            columnNames: ['rank', 'label'],
            columnGroups: [createOIMColumnGroup(['rank', 'note'])],
        })).toThrow('"note" of a column group is not among the columns');
    });

    it('refuses a slot for a group it was not given', () => {
        const { cardsService, slot } = createFixture();
        expect(() => cardsService.columnSlotService.holdColumnGroupSlot(slot, createOIMColumnGroup(['rank'])))
            .toThrow('Name it in `columnGroups`');
    });

    it('gives a column slot back and leaves the row free to go', () => {
        const { db, cardsService, slot } = createFixture();
        const rankSlot = cardsService.columnSlotService.holdColumnSlot(slot, 'rank');
        const groupSlot = cardsService.columnSlotService.holdColumnGroupSlot(slot, createOIMColumnGroup(['label', 'rank']));
        cardsService.columnSlotService.unholdColumnSlot(rankSlot);
        cardsService.columnSlotService.unholdColumnSlot(groupSlot);
        db.flush();
        expect(isOIMSlotReleased(rankSlot) && isOIMSlotReleased(groupSlot)).toBe(true);
        expect(slot.columnSlotStore).toBeUndefined();
    });
});
