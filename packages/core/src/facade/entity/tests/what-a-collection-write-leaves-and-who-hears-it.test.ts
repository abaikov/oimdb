import type { TOIMColumnSlot } from '../../../engine/column/types/TOIMColumnSlot';

import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import type { IOIMEntityWriter } from '../../../engine/entity/interfaces/IOIMEntityWriter';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import { oimIsSlotEmpty } from '../../../engine/slot/utils/oimIsSlotEmpty';

type TRow = { id: string; n: number; label?: string };

/**
 * A channel and a collection wired to report into it. WITHOUT the layer the
 * collection wakes nobody — it is no longer the default, and every `runCount` below
 * would read zero for a reason that has nothing to do with what is being
 * asserted.
 */
const createFixture = (write?: () => IOIMEntityWriter) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, TOIMStoreKey>(db, {
        keyOf: (row: TRow) => row.id,
        entityWriter: write === undefined
            ? createOIMEntityWriterInPlace()
            : write(),
    });
    const rows = rowsService.createStoreSlot(db);
    return { db, effectService, rowsService, rowsContentService: rowsService.slotContentService, rows };
};

/** The other arm of the write fork, over the same collection shape. */
const replacing = (): IOIMEntityWriter =>
    createOIMEntityWriterReplacing();

describe('a collection\'s writes: upsert, upsertMany, update, updateByKey, remove', () => {
    it('upsert of a new key adds a slot reachable by that key', () => {
        const { db,rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        expect(rowsService.getSlotByKey(rows,'r1').entity).toEqual({ id: 'r1', n: 1 });
    });

    it('upsert over a live key replaces the value', () => {
        const { db,rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1, label: 'a' });
        db.flush();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 2 });
        db.flush();

        // The whole value was replaced: the old column is gone, not merged.
        expect(rowsService.getSlotByKey(rows,'r1').entity).toEqual({ id: 'r1', n: 2 });
    });

    it('update of a missing key returns undefined and writes nothing', () => {
        const { rowsService, rows } = createFixture();

        const ghost = rowsService.findSlotByKey(rows,'ghost');
        const result = ghost === undefined ? undefined : rowsService.slotContentService.updateEntity(ghost, { n: 5 });

        expect(result).toBeUndefined();
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('upsertMany writes every item', () => {
        const { db,rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntities(rows,[{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 }]);
        db.flush();

        expect(rowsService.getSlotByKey(rows,'r1').entity).toEqual({ id: 'r1', n: 1 });
        expect(rowsService.getSlotByKey(rows,'r2').entity).toEqual({ id: 'r2', n: 2 });
        expect(rowsService.getSlotByKey(rows,'r3').entity).toEqual({ id: 'r3', n: 3 });
    });

    it('a write that changes nothing does not wake an effect', () => {
        const { db,effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        const slot = rowsService.getSlotByKey(rows,'r1');
        let runCount = 0;
        // Born between frames with nothing in the open batch, so it inherits
        // nothing and every run below is owed to a write made after it.
        effectService.createEffect(db, [slot], [], () => { runCount++; });

        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { n: 1 }); // same value
        db.flush();

        expect(runCount).toBe(0);
    });

    it('a write that changes nothing does not allocate a new object (replacing strategy)', () => {
        const { db,rowsService, rows } = createFixture(replacing);
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        const before = rowsService.getSlotByKey(rows,'r1').entity;
        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { n: 1 }); // same value
        db.flush();
        const after = rowsService.getSlotByKey(rows,'r1').entity;

        expect(after).toBe(before);
    });

    it('the in-place strategy keeps the entity reference stable across a real change', () => {
        const { db,rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        const before = rowsService.getSlotByKey(rows,'r1').entity;
        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { n: 2 });
        db.flush();
        const after = rowsService.getSlotByKey(rows,'r1').entity;

        expect(after).toBe(before);
        expect(after?.n).toBe(2);
    });

    it('the replacing strategy allocates a new object when a column actually moved', () => {
        const { db,rowsService, rows } = createFixture(replacing);
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        const before = rowsService.getSlotByKey(rows,'r1').entity;
        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { n: 2 });
        db.flush();
        const after = rowsService.getSlotByKey(rows,'r1').entity;

        expect(after).not.toBe(before);
        expect(after?.n).toBe(2);
    });

    it('update through the identity behaves the same as update by key', () => {
        const byKey = createFixture();
        byKey.rowsService.slotContentService.upsertEntity(byKey.rows, { id: 'r1', n: 1 });
        byKey.db.flush();
        let wokeByKey = 0;
        byKey.effectService.createEffect(byKey.db, [byKey.rowsService.getSlotByKey(byKey.rows, 'r1')], [], () => { wokeByKey++; });
        const byKeySlot = byKey.rowsService.findSlotByKey(byKey.rows, 'r1');
        if (byKeySlot !== undefined) byKey.rowsService.slotContentService.updateEntity(byKeySlot, { n: 9 });
        byKey.db.flush();

        const bySlot = createFixture();
        bySlot.rowsService.slotContentService.upsertEntity(bySlot.rows, { id: 'r1', n: 1 });
        bySlot.db.flush();
        const held = bySlot.rowsService.getSlotByKey(bySlot.rows, 'r1');
        let wokeBySlot = 0;
        bySlot.effectService.createEffect(bySlot.db, [held], [], () => { wokeBySlot++; });
        bySlot.rowsService.slotContentService.updateEntity(held, { n: 9 });
        bySlot.db.flush();

        expect(bySlot.rowsService.getSlotByKey(bySlot.rows, 'r1').entity?.n)
            .toBe(byKey.rowsService.getSlotByKey(byKey.rows, 'r1').entity?.n);
        expect(wokeBySlot).toBe(wokeByKey);
        expect(wokeBySlot).toBe(1);
    });

    it('remove clears the slot\'s value', () => {
        const { db,effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        // An effect on the slot, so the identity survives the removal — this
        // test is about the VALUE going away, not about release, which is
        // covered elsewhere.
        const slot = rowsService.getSlotByKey(rows,'r1');
        effectService.createEffect(db, [slot], [], () => { /* nothing */ });

        rowsService.slotContentService.deleteEntity(rowsService.getSlotByKey(rows,'r1'));
        db.flush();

        expect(oimIsSlotEmpty(slot)).toBe(true);
    });

    it('remove keeps the effects on the slot, which still run on the next write', () => {
        const { db,effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        const slot = rowsService.getSlotByKey(rows,'r1');
        let runCount = 0;
        effectService.createEffect(db, [slot], [], () => { runCount++; });

        rowsService.slotContentService.deleteEntity(rowsService.getSlotByKey(rows,'r1'));
        db.flush();

        expect(slot.effects?.length).toBe(1);
        expect(runCount).toBe(1); // the removal itself is a change the effect hears
        // The identity outlived its value, so the key is still filed and the
        // write below reaches the same slot rather than a second one.
        expect(rowsService.getSlotByKey(rows,'r1')).toBe(slot);

        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 2 });
        db.flush();

        expect(runCount).toBe(2);
    });

    it('a single entity is a standalone record written through update()', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleEntityService<{ theme: string; volume: number }>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', volume: 5 });

        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings), { volume: 8 });
        db.flush();

        expect(settingsService.getSingleSlot(settings).entity?.volume).toBe(8);
        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });

    it('a single entity\'s columns are watchable one by one: an unrelated write wakes nobody', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const settingsService = createOIMSingleEntityService<{ theme: string; volume: number }>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', volume: 5 });
        let volumeWoke = 0;
        effectService.createEffect(db, [settingsService.holdColumn(settingsService.getSingleSlot(settings), 'volume')], [], () => { volumeWoke++; });

        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings), { theme: 'light' });
        db.flush();

        expect(volumeWoke).toBe(0);
    });

    it('a single entity\'s columns are watchable one by one: the matching write does wake it', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const settingsService = createOIMSingleEntityService<{ theme: string; volume: number }>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', volume: 5 });
        let volumeWoke = 0;
        effectService.createEffect(db, [settingsService.holdColumn(settingsService.getSingleSlot(settings), 'volume')], [], () => { volumeWoke++; });

        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings), { volume: 11 });
        db.flush();

        expect(volumeWoke).toBe(1);
        expect(settingsService.getSingleSlot(settings).entity?.volume).toBe(11);
    });
});

describe('upsert over a slot that already has a value routes like an update', () => {
    type TCard = { id: string; deckId: string; rank: number; title?: string };

    const createFixture =() => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, { keyOf: (card: TCard) => card.id });
        const cards = cardsService.createStoreSlot(db);
        return { db, cardsService, cards };
    };

    it('still takes away a column the new entity does not carry', () => {
        const { db,cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1', rank: 1, title: 'kept' });
        db.flush();

        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1', rank: 1 });
        db.flush();

        expect((cardsService.getSlotByKey(cards,'c1').entity as { title?: string }).title).toBeUndefined();
    });
});

describe('the replacing write strategy, when a column goes away', () => {
    // `upsertEntity` routes through it, so a reader that compares by reference depends
    // on it on the ordinary write path.
    type TCard = { id: string; deckId?: string; title?: string };

    const createFixture =() => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, {
            keyOf: (card: TCard) => card.id,
            entityWriter: createOIMEntityWriterReplacing(),
        });
        const effectService = OIMEffectService.INSTANCE;
        const cards = cardsService.createStoreSlot(db);
        return { db, effectService, cardsService, cards };
    };

    it('hands a reference-comparing reader a NEW object when a column is removed', () => {
        const { db,cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1', title: 'kept' });
        db.flush();

        const before = cardsService.getSlotByKey(cards,'c1').entity;
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1' });
        db.flush();

        const after = cardsService.getSlotByKey(cards,'c1').entity;
        expect(after).not.toBe(before);
        expect(after).toEqual({ id: 'c1', deckId: 'd1' });
        // The old object is untouched, which is the whole contract: a reader
        // holding it still sees the state it was handed.
        expect(before).toEqual({ id: 'c1', deckId: 'd1', title: 'kept' });
    });

    it('does not allocate when the column was not there to begin with', () => {
        const { db,cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1' });
        db.flush();

        const before = cardsService.getSlotByKey(cards,'c1').entity;
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1' });
        db.flush();

        // Nothing moved and nothing was removed, so nobody may be handed a new
        // reference — that is what tells a reader something happened.
        expect(cardsService.getSlotByKey(cards,'c1').entity).toBe(before);
    });

    it('tells a column subscriber that the column it watches has gone', () => {
        const { db,effectService, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1', deckId: 'd1' });
        db.flush();
        const slot = cardsService.getSlotByKey(cards,'c1');

        let deckWoke = 0;
        effectService.createEffect(db, [cardsService.holdColumn(slot, 'deckId')], [], () => { deckWoke++; });

        // The column LEAVES rather than changing: a whole-entity write that no
        // longer carries it. A reader watching that column is owed the same
        // report either way, which is what the rebuild in `deleteColumns` owes.
        cardsService.slotContentService.upsertEntity(cards,{ id: 'c1' });
        db.flush();

        expect(deckWoke).toBe(1);
        expect((slot.entity as { deckId?: string }).deckId).toBeUndefined();
    });
});

describe('a collection\'s narrow identities: a column per slot, and a slot a bucket still holds', () => {
    it('reports a slot vanishing, while a bucket still holds it', () => {
        const { db,effectService, rowsService, rows } = createFixture();
        const everythingService = createOIMBucketService<
            TOIMEntitySlot<TRow>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TRow>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>() });
        const everything = everythingService.createStoreSlot(db);
        let runCount = 0;
        const row = rowsService.holdSlotByKey(rows, 'r1');
        effectService.createEffect(db, [row], [], () => { runCount++; });

        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        // A bucket's slots are the caller's, so the slot is put in a bucket by
        // hand, and the slot in it is what keeps the bucket from here on.
        const heldSlot = everythingService.holdSlotByKey(everything, 'all');
        everythingService.slotContentService.writeBucketMemberSlots(heldSlot, [row]);
        heldSlot.owner.unholdSlot(heldSlot);
        db.flush();
        expect(runCount).toBe(1);

        rowsService.slotContentService.deleteEntity(rowsService.getSlotByKey(rows,'r1'));
        db.flush();
        expect(runCount).toBe(2);
        // And the slot is still an identity, holding no value: `remove` takes
        // the VALUE away and leaves the slot in the bucket, which is the
        // caller's to take out.
        expect(everythingService.slotContentService.getBucketMemberSlotCount(heldSlot)).toBe(1);
        expect(oimIsSlotEmpty(rowsService.getSlotByKey(rows,'r1'))).toBe(true);
    });

    /**
     * A caller asks for one COLUMN OF ONE SLOT, and the identity behind it is
     * minted by that ask and by nothing else — no declaration, and no
     * per-collection channel.
     *
     * That is the whole difference in cost, and it is why the assertions below
     * are on `slot.columnSlotStore`: a collection nobody watches by column carries no map
     * at all, so a write pays one field read rather than a walk of whatever
     * something once declared.
     */
    it('mints a column identity on the first ask, tells it when that column moved, and takes it back', () => {
        const { db,effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 1, label: 'a' });
        db.flush();
        const slot = rowsService.getSlotByKey(rows,'r1');
        // Nothing has been asked for, so the slot carries nothing.
        expect(slot.columnSlotStore).toBeUndefined();

        let runCount = 0;
        const column = rowsService.holdColumn(slot, 'n');
        const columnEffect = effectService.createEffect(db, [column], [], () => { runCount++; });
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.has('n')).toBe(true);
        // And only the column that was asked for.
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.has('label')).toBe(false);

        // A column nobody is watching reaches nothing.
        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { label: 'b' });
        db.flush();
        expect(runCount).toBe(0);

        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { n: 2 });
        db.flush();
        expect(runCount).toBe(1);

        // The last listener leaves, the ask is given back, and the slot stops
        // carrying the column — and the map with it, because its absence is
        // what the write path's one field read is asking about.
        effectService.disposeEffect(columnEffect);
        rowsService.unholdColumn(column);
        expect(slot.columnSlotStore).toBeUndefined();
    });
});

