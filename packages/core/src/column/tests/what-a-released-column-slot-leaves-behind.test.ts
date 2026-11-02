import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMPushColumnSlotOwner } from '../OIMPushColumnSlotOwner';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMColumnGroup } from '../utils/createOIMColumnGroup';

type TCard = { id: string; rank: number; label: string; note: string };

const rankLabelColumns = createOIMColumnGroup<keyof TCard>(['rank', 'label']);

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({
        slotContentService: createOIMEntityContentService<TCard, string>(), columnGroups: [rankLabelColumns],
    });
    const cards = cardsService.createStoreSlot(db);
    const firstCard = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', rank: 1, label: 'ace', note: '' });
    const secondCard = cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', rank: 2, label: 'two', note: '' });
    db.flush();
    return { db, cardsService, cards, firstCard, secondCard };
};

const STORE_SLOT_COLUMN_FIELDS = ['columnGroupsByKey', 'columnGroupSlotCountsByKey', 'columnReadersByColumnName', 'anyColumnSlotCount'];

describe('what a released column slot leaves behind', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('keeps no record of column readers on the store slot at all', () => {
        const { cardsService, cards, firstCard } = createFixture();
        cardsService.columnSlotService.holdColumn(firstCard, 'rank');
        cardsService.columnSlotService.holdColumnGroup(firstCard, rankLabelColumns);
        cardsService.columnSlotService.holdAnyColumn(firstCard);
        expect(STORE_SLOT_COLUMN_FIELDS.filter(field => field in cards)).toEqual([]);
    });

    it.each([
        ['a single column', 'rank'],
        ['a column group', 'group'],
        ['the any-column slot', 'any'],
    ] as const)('is nothing, for %s, and the next write takes no column path', (_label, kind) => {
        const { db, cardsService, firstCard } = createFixture();
        const columnSlotService = cardsService.columnSlotService;
        const columnSlot = kind === 'rank' ? columnSlotService.holdColumn(firstCard, 'rank')
            : kind === 'group' ? columnSlotService.holdColumnGroup(firstCard, rankLabelColumns)
                : columnSlotService.holdAnyColumn(firstCard);
        columnSlotService.unholdColumn(columnSlot);
        expect(firstCard.columnSlotStore).toBeUndefined();

        const markColumnsChanged = jest.spyOn(OIMPushColumnSlotOwner.prototype, 'markColumnsChanged');
        cardsService.slotContentService.updateEntity(firstCard, { rank: 5, label: 'king', note: 'kept' });
        db.flush();
        expect(markColumnsChanged).not.toHaveBeenCalled();
    });

    it('keeps waking a group after the single column of one of its names is released', () => {
        const { db, cardsService, firstCard } = createFixture();
        const groupSlot = cardsService.columnSlotService.holdColumnGroup(firstCard, rankLabelColumns);
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, [groupSlot]);
        cardsService.columnSlotService.unholdColumn(cardsService.columnSlotService.holdColumn(firstCard, 'rank'));
        db.flush();
        const runsBefore = runs;
        cardsService.slotContentService.updateEntityColumn(firstCard, 'rank', 7);
        db.flush();
        expect(runs).toBe(runsBefore + 1);
    });

    it('keeps a column another carrier still reads, so that carrier still hears the write', () => {
        const { db, cardsService, firstCard, secondCard } = createFixture();
        const firstRankSlot = cardsService.columnSlotService.holdColumn(firstCard, 'rank');
        const secondRankSlot = cardsService.columnSlotService.holdColumn(secondCard, 'rank');
        let secondRuns = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { secondRuns++; }, [secondRankSlot]);
        db.flush();
        cardsService.columnSlotService.unholdColumn(firstRankSlot);
        const runsBefore = secondRuns;
        cardsService.slotContentService.updateEntity(secondCard, { rank: 9 });
        db.flush();
        expect(secondRuns).toBe(runsBefore + 1);
    });

    it('releases a slot once, however many times its release is asked for', () => {
        const { cardsService, firstCard, secondCard } = createFixture();
        const columnSlotService = cardsService.columnSlotService;
        const kept = [
            columnSlotService.holdColumn(secondCard, 'rank'),
            columnSlotService.holdColumnGroup(secondCard, rankLabelColumns),
            columnSlotService.holdAnyColumn(secondCard),
        ];
        const released = [
            columnSlotService.holdColumn(firstCard, 'rank'),
            columnSlotService.holdColumnGroup(firstCard, rankLabelColumns),
            columnSlotService.holdAnyColumn(firstCard),
        ];
        for (const columnSlot of released) columnSlotService.unholdColumn(columnSlot);
        for (const columnSlot of released) columnSlot.owner.releaseSlotIfUnheld(columnSlot);
        expect(firstCard.columnSlotStore).toBeUndefined();
        expect(columnSlotService.holdColumn(secondCard, 'rank')).toBe(kept[0]);
        expect(columnSlotService.holdColumnGroup(secondCard, rankLabelColumns)).toBe(kept[1]);
        expect(columnSlotService.holdAnyColumn(secondCard)).toBe(kept[2]);
    });

    it('refuses a group of no columns, so the any-column slot keeps hearing writes', () => {
        const { db, cardsService, firstCard } = createFixture();
        expect(() => createOIMColumnGroup([])).toThrow(/at least one column/);
        const anyColumnSlot = cardsService.columnSlotService.holdAnyColumn(firstCard);
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, [anyColumnSlot]);
        db.flush();
        const runsBefore = runs;
        cardsService.slotContentService.updateEntity(firstCard, { note: 'heard' });
        db.flush();
        expect(runs).toBe(runsBefore + 1);
    });

    it('refuses a group the collection was not created with', () => {
        const { cardsService, firstCard } = createFixture();
        expect(() => cardsService.columnSlotService.holdColumnGroup(firstCard, { key: 'rank', columnNames: ['rank'] }))
            .toThrow('Name it in `columnGroups`');
    });

    it('files a group asked for by its key alone as that group, and gives it back at the flush', () => {
        const { db, cardsService, firstCard } = createFixture();
        const groupSlot = cardsService.columnSlotService.getColumn(firstCard, rankLabelColumns.key as 'rank');
        expect(groupSlot).toBe(cardsService.columnSlotService.getColumnGroupSlot(firstCard, rankLabelColumns));
        db.flush();
        expect(firstCard.columnSlotStore).toBeUndefined();
    });
});
