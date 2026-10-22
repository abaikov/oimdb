import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMColumnOwnerPushDriven } from '../OIMColumnOwnerPushDriven';

type TCard = { id: string; rank: number; label: string; note: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const firstCard = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', rank: 1, label: 'ace', note: '' });
    const secondCard = cardsService.slotContentService.upsertEntity(cards, { id: 'c2', rank: 2, label: 'two', note: '' });
    db.flush();
    return { db, cardsService, cards, firstCard, secondCard };
};

const registryOf = (fixture: ReturnType<typeof createFixture>) => ({
    anyColumnSlotCount: fixture.cards.anyColumnSlotCount,
    columnGroupKeys: [...(fixture.cards.columnGroupsByKey?.keys() ?? [])],
    columnGroupSlotCounts: [...(fixture.cards.columnGroupSlotCountsByKey?.entries() ?? [])],
    columnReaders: [...(fixture.cards.columnReadersByColumnName?.entries() ?? [])]
        .map(([columnName, columnReaders]) => [columnName, columnReaders.columnSlotCount, columnReaders.columnGroups.length]),
});

const EMPTY_REGISTRY = { anyColumnSlotCount: 0, columnGroupKeys: [], columnGroupSlotCounts: [], columnReaders: [] };

describe('what a released column slot leaves on the store slot', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('is nothing, for a single column, and the next write to it takes no column path', () => {
        const fixture = createFixture();
        const { db, cardsService, firstCard } = fixture;
        cardsService.unholdColumn(cardsService.holdColumn(firstCard, 'rank'));
        expect(registryOf(fixture)).toEqual(EMPTY_REGISTRY);

        const markColumnsChanged = jest.spyOn(OIMColumnOwnerPushDriven.prototype, 'markColumnsChanged');
        cardsService.slotContentService.updateEntity(firstCard, { rank: 5 });
        db.flush();
        expect(markColumnsChanged).not.toHaveBeenCalled();
    });

    it('is nothing, for a column group, and the next write to one of its columns takes no column path', () => {
        const fixture = createFixture();
        const { db, cardsService, firstCard } = fixture;
        cardsService.unholdColumn(cardsService.holdColumnGroup(firstCard, cardsService.getColumnGroup(['rank', 'label'])));
        expect(registryOf(fixture)).toEqual(EMPTY_REGISTRY);

        const markColumnsChanged = jest.spyOn(OIMColumnOwnerPushDriven.prototype, 'markColumnsChanged');
        cardsService.slotContentService.updateEntity(firstCard, { label: 'king' });
        db.flush();
        expect(markColumnsChanged).not.toHaveBeenCalled();
    });

    it('is nothing, for the any-column slot, and the next write takes no column path', () => {
        const fixture = createFixture();
        const { db, cardsService, firstCard } = fixture;
        cardsService.unholdColumn(cardsService.holdAnyColumn(firstCard));
        expect(registryOf(fixture)).toEqual(EMPTY_REGISTRY);

        const markColumnsChanged = jest.spyOn(OIMColumnOwnerPushDriven.prototype, 'markColumnsChanged');
        cardsService.slotContentService.updateEntity(firstCard, { note: 'kept' });
        db.flush();
        expect(markColumnsChanged).not.toHaveBeenCalled();
    });

    it('keeps the name a group still reads after the single column of that name is released', () => {
        const fixture = createFixture();
        const { cardsService, firstCard } = fixture;
        const rankLabelColumns = cardsService.getColumnGroup(['rank', 'label']);
        const groupSlot = cardsService.holdColumnGroup(firstCard, rankLabelColumns);
        cardsService.unholdColumn(cardsService.holdColumn(firstCard, 'rank'));
        expect(registryOf(fixture)).toEqual({
            anyColumnSlotCount: 0,
            columnGroupKeys: [rankLabelColumns.key],
            columnGroupSlotCounts: [[rankLabelColumns.key, 1]],
            columnReaders: [['label', 0, 1], ['rank', 0, 1]],
        });
        cardsService.unholdColumn(groupSlot);
        expect(registryOf(fixture)).toEqual(EMPTY_REGISTRY);
    });

    it('keeps a column another carrier still reads, so that carrier still hears the write', () => {
        const fixture = createFixture();
        const { db, cardsService, firstCard, secondCard } = fixture;
        const firstRankSlot = cardsService.holdColumn(firstCard, 'rank');
        const secondRankSlot = cardsService.holdColumn(secondCard, 'rank');
        let secondRuns = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [secondRankSlot], [], () => { secondRuns++; });
        db.flush();
        cardsService.unholdColumn(firstRankSlot);
        expect(registryOf(fixture).columnReaders).toEqual([['rank', 1, 0]]);

        const runsBefore = secondRuns;
        cardsService.slotContentService.updateEntity(secondCard, { rank: 9 });
        db.flush();
        expect(secondRuns).toBe(runsBefore + 1);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        cardsService.unholdColumn(secondRankSlot);
        expect(registryOf(fixture)).toEqual(EMPTY_REGISTRY);
    });

    it('counts a released slot once, however many times its release is asked for', () => {
        const fixture = createFixture();
        const { cardsService, firstCard, secondCard } = fixture;
        const rankLabelColumns = cardsService.getColumnGroup(['rank', 'label']);
        cardsService.holdColumn(secondCard, 'rank');
        cardsService.holdColumnGroup(secondCard, rankLabelColumns);
        cardsService.holdAnyColumn(secondCard);
        const released = [
            cardsService.holdColumn(firstCard, 'rank'),
            cardsService.holdColumnGroup(firstCard, rankLabelColumns),
            cardsService.holdAnyColumn(firstCard),
        ];
        for (const columnSlot of released) cardsService.unholdColumn(columnSlot);
        const registryAfterRelease = registryOf(fixture);

        for (const columnSlot of released) columnSlot.owner.releaseSlotIfUnheld(columnSlot);
        expect(registryOf(fixture)).toEqual(registryAfterRelease);
        expect(registryAfterRelease).toEqual({
            anyColumnSlotCount: 1,
            columnGroupKeys: [rankLabelColumns.key],
            columnGroupSlotCounts: [[rankLabelColumns.key, 1]],
            columnReaders: [['rank', 1, 1], ['label', 0, 1]],
        });
    });

    it('refuses a group of no columns, so the any-column slot keeps hearing writes', () => {
        const fixture = createFixture();
        const { db, cardsService, firstCard } = fixture;
        expect(() => cardsService.getColumnGroup([])).toThrow(/at least one column/);

        const anyColumnSlot = cardsService.holdAnyColumn(firstCard);
        let runs = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [anyColumnSlot], [], () => { runs++; });
        db.flush();
        const runsBefore = runs;
        cardsService.slotContentService.updateEntity(firstCard, { note: 'heard' });
        db.flush();
        expect(runs).toBe(runsBefore + 1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        cardsService.unholdColumn(anyColumnSlot);
        expect(registryOf(fixture)).toEqual(EMPTY_REGISTRY);
    });

    it('refuses a group whose key is not the key of its columns', () => {
        const { cardsService, firstCard } = createFixture();
        expect(() => cardsService.holdColumnGroup(firstCard, { key: 'rank', columnNames: ['rank'] })).toThrow(/not the key of its columns/);
    });

    it('files a group asked for by its key alone as that group, and gives it back as one', () => {
        const fixture = createFixture();
        const { db, cardsService, firstCard } = fixture;
        const rankLabelColumns = cardsService.getColumnGroup(['rank', 'label']);
        const groupSlot = cardsService.getColumn(firstCard, rankLabelColumns.key as 'rank');
        expect(registryOf(fixture)).toEqual({
            anyColumnSlotCount: 0,
            columnGroupKeys: [rankLabelColumns.key],
            columnGroupSlotCounts: [[rankLabelColumns.key, 1]],
            columnReaders: [['label', 0, 1], ['rank', 0, 1]],
        });
        expect(groupSlot.key).toBe(rankLabelColumns.key);
        db.flush();
        expect(registryOf(fixture)).toEqual(EMPTY_REGISTRY);
    });
});
