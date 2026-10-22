import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';

import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotOwnerService } from '../../slot/OIMSlotOwnerService';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';

type TCard = { id: string; deckId: string; title: string; rank: number; note: string };

const COLUMNS = 5;

const cards = (count: number): TCard[] => {
    const out: TCard[] = [];
    for (let i = 0; i < count; i++) {
        out.push({ id: `c${i}`, deckId: `d${i % 4}`, title: `card ${i}`, rank: i, note: '' });
    }
    return out;
};

const createFixture =() => {
    const db = new OIMDB();
    const collectionService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const collection = collectionService.createStoreSlot(db);
    const updateEntityByKey = (key: string, patch: Partial<TCard>): void => {
        const slot = collectionService.findSlotByKey(collection, key);
        if (slot !== undefined) collectionService.slotContentService.updateEntity(slot, patch);
    };
    const deleteEntityByKey = (key: string): void => {
        const slot = collectionService.findSlotByKey(collection, key);
        if (slot !== undefined) collectionService.slotContentService.deleteEntity(slot);
    };
    return { db, collectionService, collection, updateEntityByKey, deleteEntityByKey };
};

const namesAskedFor = (body: () => void): number => {
    const takeChangedColumnNames = jest.spyOn(OIMSlotOwnerService.prototype, 'takeChangedColumnNames');
    try {
        body();
        return takeChangedColumnNames.mock.calls.length;
    } finally {
        takeChangedColumnNames.mockRestore();
    }
};

describe('a collection nobody watches by column', () => {
    it('asks for no column names at either end of a record\'s life', () => {
        const { collectionService, collection, deleteEntityByKey } = createFixture();
        const rows = cards(100);

        const onInsert = namesAskedFor(() => { collectionService.slotContentService.upsertEntities(collection,rows); });
        // Without the gate this is ONE PER INSERTED RECORD, for a collection that
        // has no column map to look any of the names up in.
        expect(onInsert).toBe(0);
        // The records really did land, or the zero above is the zero of a
        // fixture that wrote nothing.
        expect(collectionService.getSlotCount(collection)).toBe(100);
        expect(collectionService.getSlotByKey(collection,'c7')?.entity?.title).toBe('card 7');
        expect(Object.keys(collectionService.getSlotByKey(collection,'c7')!.entity!).length).toBe(COLUMNS);

        const onRemove = namesAskedFor(() => {
            for (let i = 0; i < rows.length; i++) deleteEntityByKey(`c${i}`);
        });
        // And one per REMOVED record.
        expect(onRemove).toBe(0);
        expect(collectionService.getSlotCount(collection)).toBe(0);
    });

    /**
     * A PATCH NEVER ASKED, and it is here so the two ends are not credited with a
     * saving the middle already had: `patchEntity` and `deleteColumns` hand back the
     * names they changed, so nothing on that path ever built a list to be gated.
     */
    it('asks for none on a patch either, which was already true', () => {
        const { collectionService, collection, updateEntityByKey } = createFixture();
        collectionService.slotContentService.upsertEntities(collection,cards(10));

        const asked = namesAskedFor(() => {
            for (let i = 0; i < 10; i++) updateEntityByKey(`c${i}`, { rank: i + 1000 });
        });

        expect(asked).toBe(0);
        expect(collectionService.getSlotByKey(collection,'c3')?.entity?.rank).toBe(1003);
    });
});

describe('a collection with one slot watched by column', () => {
    it('asks for names once on the fill and not on the clear, and the watcher hears both', () => {
        const { db, collectionService, collection, deleteEntityByKey } = createFixture();
        // The identity before the value, which is the case the gate has to let
        // through: the map exists on a slot that holds nothing, so the write that
        // FILLS it is a write whose columns somebody is watching.
        const heldSlot = collectionService.holdSlotByKey(collection, 'c0');
        OIMEffectService.INSTANCE.createEffect(db, [collectionService.getColumn(heldSlot, 'title')], [], () => { /* counted below */ });
        expect((heldSlot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(1);
        expect(oimIsSlotEmpty(heldSlot)).toBe(true);

        const rows = cards(100);
        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(
            db,
            [collectionService.getColumn(heldSlot, 'title')],
            [],
            () => { runCount++; },
        );
        db.flush();
        runCount = 0;
        const onInsert = namesAskedFor(() => { collectionService.slotContentService.upsertEntities(collection,rows); });

        expect(onInsert).toBe(1);
        db.flush();
        expect(runCount).toBe(1);

        const onRemove = namesAskedFor(() => {
            for (let i = 0; i < rows.length; i++) deleteEntityByKey(`c${i}`);
        });

        // None on the clear: it hands the stored record over, and the watcher still hears it.
        expect(onRemove).toBe(0);
        db.flush();
        expect(runCount).toBe(2);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    /**
     * THE WAKE-UPS, WHICH ARE THE HALF A COUNTER CANNOT SHOW. Everything above is
     * a claim about something NOT happening, and a gate that declined too often
     * would satisfy all of it.
     */
    it('wakes the column subscriber on the fill and on the clear', () => {
        const { db, collectionService, collection, updateEntityByKey, deleteEntityByKey } = createFixture();
        const heldSlot = collectionService.holdSlotByKey(collection, 'c0');
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [collectionService.getColumn(heldSlot, 'title')], [], () => { runs++; });
        db.flush();
        const born = runs;

        // THE FILL. The slot held nothing, so this write goes through `fillSlot`
        // and the names come off the stored record.
        collectionService.slotContentService.upsertEntities(collection,cards(3));
        db.flush();
        expect(runs).toBe(born + 1);

        // A column of the same slot that is NOT watched, so the count must not
        // move: the array asked for is the whole record, and the map is what
        // narrows it.
        updateEntityByKey('c0', { rank: 99 });
        db.flush();
        expect(runs).toBe(born + 1);

        // The watched column, changed.
        updateEntityByKey('c0', { title: 'renamed' });
        db.flush();
        expect(runs).toBe(born + 2);

        // THE CLEAR. Every column the record carried left with it, the watched
        // one among them.
        deleteEntityByKey('c0');
        db.flush();
        expect(runs).toBe(born + 3);

        // And a slot that never held a value has no names to take away, so the
        // clear of one wakes nobody through the column path.
        deleteEntityByKey('c0');
        db.flush();
        expect(runs).toBe(born + 3);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});
