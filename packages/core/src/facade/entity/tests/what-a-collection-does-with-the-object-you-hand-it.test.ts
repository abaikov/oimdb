import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { oimInsertEntityWithCopy } from '../../../engine/entity/utils/oimInsertEntityWithCopy';
import { oimInsertEntityWithSanitizedCopy } from '../../../engine/entity/utils/oimInsertEntityWithSanitizedCopy';
// Not a public export — the rule about which names may be a column, imported by
// path so this file reads the answer OFF the rule instead of restating it.
import { oimIsProtoKey } from '../../../engine/entity/utils/oimIsProtoKey';
import { oimPatchEntityColumnsGuarded } from '../../../engine/entity/utils/oimPatchEntityColumnsGuarded';
import { oimPatchEntityColumnGuarded } from '../../../engine/entity/utils/oimPatchEntityColumnGuarded';
import type { IOIMEntityWriter } from '../../../engine/entity/interfaces/IOIMEntityWriter';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';

type TRow = { id: string; n: number; label?: string };
type TCard = { id: string; deckId: string };

/**
 * A collection of rows over whichever write stack the caller names. Two
 * collections on one channel take TWO layers over the same inner strategy: a
 * layer refuses to serve a second collection, because it marks the collection
 * it holds for every slot written through it.
 */
const rowsOn = (db: OIMDB, write: IOIMEntityWriter) => {
    const rowsService = createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, TOIMStoreKey>(db, {
        keyOf: (row: TRow) => row.id,
        entityWriter: write,
    });
    return { rowsService, rowsContentService: rowsService.slotContentService, rows: rowsService.createStoreSlot(db) };
};

const inPlaceOn = (db: OIMDB) =>
    rowsOn(db, createOIMEntityWriterInPlace());

const replacingOn = (db: OIMDB) =>
    rowsOn(db, createOIMEntityWriterReplacing());

const copyingInPlaceOn = (db: OIMDB) =>
    rowsOn(db, createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }));

const sanitizingInPlaceOn = (db: OIMDB) =>
    rowsOn(db, createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithSanitizedCopy }));

const guardedPatch = { patchEntityColumns: oimPatchEntityColumnsGuarded, patchEntityColumn: oimPatchEntityColumnGuarded };

const guardedInPlaceOn = (db: OIMDB) =>
    rowsOn(db, createOIMEntityWriterInPlace(guardedPatch));

const guardedReplacingOn = (db: OIMDB) =>
    rowsOn(db, createOIMEntityWriterReplacing(guardedPatch));

/**
 * A patch the way one actually arrives: parsed out of a payload nobody in this
 * process wrote. `__proto__` in JSON becomes an OWN enumerable property, which
 * is exactly what a write path that assigns by name walks — an object literal
 * cannot express it, so nothing but a parse (or a `defineProperty`) reproduces
 * the case.
 */
function parsedPatch(json: string): Partial<TRow> {
    return JSON.parse(json) as Partial<TRow>;
}

describe('the default patch does not filter a prototype key', () => {
    it('lets an own __proto__ in a patch reach the stored entity\'s prototype on an in-place write', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = inPlaceOn(db);
        rowsContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        db.flush();

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows, 'r1'), parsedPatch('{"__proto__":{"polluted":true},"n":2}'));
        db.flush();

        const stored = rowsService.getSlotByKey(rows, 'r1').entity as TRow;
        expect(stored.n).toBe(2);
        expect((stored as unknown as Record<string, unknown>).polluted).toBe(true);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('lets it reach the rebuilt entity\'s prototype on a replacing write', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = replacingOn(db);
        rowsContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        db.flush();

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows, 'r1'), parsedPatch('{"__proto__":{"polluted":true},"n":2}'));
        db.flush();

        const stored = rowsService.getSlotByKey(rows, 'r1').entity as TRow;
        expect(stored.n).toBe(2);
        expect((stored as unknown as Record<string, unknown>).polluted).toBe(true);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});

describe('a guarded patch cannot reach a stored entity\'s prototype', () => {
    it('leaves the prototype alone on an in-place write', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = guardedInPlaceOn(db);
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), parsedPatch('{"__proto__":{"polluted":true},"n":2}'));
        db.flush();

        const stored = rowsService.getSlotByKey(rows,'r1').entity as TRow;
        expect(stored.n).toBe(2);
        expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
        expect((stored as unknown as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(stored, '__proto__')).toBe(false);
    });

    it('leaves the prototype alone on a replacing write', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = guardedReplacingOn(db);
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), parsedPatch('{"__proto__":{"polluted":true},"n":2}'));
        db.flush();

        const stored = rowsService.getSlotByKey(rows,'r1').entity as TRow;
        expect(stored.n).toBe(2);
        expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
        expect((stored as unknown as Record<string, unknown>).polluted).toBeUndefined();
        // A spread never called the setter — what it did was carry the name into
        // the entity as data, where the rebuild in `deleteColumns` assigns by name
        // and the setter IS called.
        expect(Object.prototype.hasOwnProperty.call(stored, '__proto__')).toBe(false);
    });

    it('drops the own __proto__ key on an insert under oimInsertEntityWithSanitizedCopy', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = sanitizingInPlaceOn(db);
        rowsContentService.upsertEntity(rows,JSON.parse('{"id":"r1","n":1,"__proto__":{"polluted":true}}') as TRow);
        db.flush();

        const stored = rowsService.getSlotByKey(rows,'r1').entity as TRow;
        expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
        expect(Object.keys(stored)).toEqual(['id', 'n']);
    });

    it('keeps the handed object, own __proto__ key included, on an insert under the default', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = inPlaceOn(db);
        const payload = JSON.parse('{"id":"r1","n":1,"__proto__":{"polluted":true}}') as TRow;
        rowsContentService.upsertEntity(rows,payload);
        db.flush();

        const stored = rowsService.getSlotByKey(rows,'r1').entity as TRow;
        expect(stored).toBe(payload);
        expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
    });

    it('wakes nobody, because the name moved no column', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const { rowsService, rowsContentService, rows } = guardedInPlaceOn(db);
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();
        let runCount = 0;
        effectService.createEffect(db, [rowsService.getSlotByKey(rows,'r1')], [], () => { runCount++; });

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), parsedPatch('{"__proto__":{"polluted":true}}'));
        db.flush();

        expect(runCount).toBe(0);
    });

    it('allocates nothing under the replacing strategy, because nothing moved', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = guardedReplacingOn(db);
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();
        const before = rowsService.getSlotByKey(rows,'r1').entity;

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), parsedPatch('{"__proto__":{"polluted":true}}'));
        db.flush();

        expect(rowsService.getSlotByKey(rows,'r1').entity).toBe(before);
    });

    it('says the same thing under both strategies', () => {
        const db = new OIMDB();
        const { rowsService: inPlaceService, rowsContentService: inPlaceContentService, rows: inPlace } = guardedInPlaceOn(db);
        const { rowsService: replacingService, rowsContentService: replacingContentService, rows: replacing } = guardedReplacingOn(db);
        inPlaceContentService.upsertEntity(inPlace,{ id: 'r1', n: 1 });
        replacingContentService.upsertEntity(replacing,{ id: 'r1', n: 1 });
        db.flush();

        inPlaceContentService.updateEntity(inPlaceService.getSlotByKey(inPlace,'r1'), parsedPatch('{"__proto__":{"polluted":true},"n":2}'));
        replacingContentService.updateEntity(replacingService.getSlotByKey(replacing,'r1'), parsedPatch('{"__proto__":{"polluted":true},"n":2}'));
        db.flush();

        // A caller must not have to know which strategy their collection was
        // built with to know what a patch does.
        expect(inPlaceService.getSlotByKey(inPlace,'r1').entity).toEqual(replacingService.getSlotByKey(replacing,'r1').entity);
        expect(Object.getPrototypeOf(inPlaceService.getSlotByKey(inPlace,'r1').entity as TRow))
            .toBe(Object.getPrototypeOf(replacingService.getSlotByKey(replacing,'r1').entity as TRow));
    });

    it('lets one rule decide, for both strategies, which names are columns', () => {
        // The expected answer is read OFF `oimIsProtoKey` rather than written
        // out here, so a name added to the rule that only one strategy honours,
        // or a skip added to one strategy and not the rule, goes red here.
        const names = ['__proto__', 'label', 'constructor', 'toString'];
        for (const name of names) {
            const db = new OIMDB();
            const { rowsService: inPlaceService, rowsContentService: inPlaceContentService, rows: inPlace } = guardedInPlaceOn(db);
            const { rowsService: replacingService, rowsContentService: replacingContentService, rows: replacing } = guardedReplacingOn(db);
            inPlaceContentService.upsertEntity(inPlace,{ id: 'r1', n: 1 });
            replacingContentService.upsertEntity(replacing,{ id: 'r1', n: 1 });
            db.flush();

            // A COMPUTED key, so the `{ __proto__: … }` literal special case
            // never applies: this is an own enumerable property whatever the
            // name, which is what a parsed payload hands the write path.
            const patch = { [name]: 'v' } as unknown as Partial<TRow>;
            inPlaceContentService.updateEntity(inPlaceService.getSlotByKey(inPlace,'r1'), patch);
            replacingContentService.updateEntity(replacingService.getSlotByKey(replacing,'r1'), patch);
            db.flush();

            const inPlaceEntity = inPlaceService.getSlotByKey(inPlace,'r1').entity as object;
            const replacingEntity = replacingService.getSlotByKey(replacing,'r1').entity as object;
            expect(Object.prototype.hasOwnProperty.call(inPlaceEntity, name))
                .toBe(!oimIsProtoKey(name));
            expect(Object.prototype.hasOwnProperty.call(replacingEntity, name))
                .toBe(!oimIsProtoKey(name));
        }
    });
});

describe('by default the collection keeps the object handed to it', () => {
    it('stores the very object handed to a fresh insert', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = inPlaceOn(db);
        const item: TRow = { id: 'r1', n: 1 };
        rowsContentService.upsertEntity(rows,item);
        db.flush();

        expect(rowsService.getSlotByKey(rows,'r1').entity).toBe(item);
    });

    it('shows a later mutation of what the caller passed, and wakes nobody', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const { rowsService, rowsContentService, rows } = inPlaceOn(db);
        const item: TRow = { id: 'r1', n: 1 };
        rowsContentService.upsertEntity(rows,item);
        db.flush();
        let runCount = 0;
        effectService.createEffect(db, [rowsService.getSlotByKey(rows,'r1')], [], () => { runCount++; });

        item.n = 99;
        db.flush();

        expect(rowsService.getSlotByKey(rows,'r1').entity).toBe(item);
        expect(rowsService.getSlotByKey(rows,'r1').entity?.n).toBe(99);
        expect(runCount).toBe(0);
    });

    it('edits the handed object when an in-place update lands', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = inPlaceOn(db);
        const item: TRow = { id: 'r1', n: 1 };
        rowsContentService.upsertEntity(rows,item);
        db.flush();

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { n: 2 });
        db.flush();

        expect(item.n).toBe(2);
        expect(rowsService.getSlotByKey(rows,'r1').entity).toBe(item);
    });
});

describe('the collection built with oimInsertEntityWithCopy owns its entities', () => {
    it('does not keep the object handed to a fresh insert', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = copyingInPlaceOn(db);
        const item: TRow = { id: 'r1', n: 1 };
        rowsContentService.upsertEntity(rows,item);
        db.flush();

        expect(rowsService.getSlotByKey(rows,'r1').entity).not.toBe(item);
        expect(rowsService.getSlotByKey(rows,'r1').entity).toEqual({ id: 'r1', n: 1 });
    });

    it('ignores a later mutation of what the caller passed', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const { rowsService, rowsContentService, rows } = copyingInPlaceOn(db);
        const item: TRow = { id: 'r1', n: 1 };
        rowsContentService.upsertEntity(rows,item);
        db.flush();
        let runCount = 0;
        effectService.createEffect(db, [rowsService.getSlotByKey(rows,'r1')], [], () => { runCount++; });

        item.n = 99;
        db.flush();

        expect(rowsService.getSlotByKey(rows,'r1').entity).toEqual({ id: 'r1', n: 1 });
        expect(runCount).toBe(0);
    });

    it('behaves the same whether or not the key had a value already', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = copyingInPlaceOn(db);
        rowsContentService.upsertEntity(rows,{ id: 'live', n: 1 });
        db.flush();
        const fresh: TRow = { id: 'fresh', n: 1 };
        const overwrite: TRow = { id: 'live', n: 1 };
        rowsContentService.upsertEntity(rows,fresh);
        rowsContentService.upsertEntity(rows,overwrite);
        db.flush();

        fresh.n = 99;
        overwrite.n = 99;

        expect(rowsService.getSlotByKey(rows,'fresh').entity).toEqual({ id: 'fresh', n: 1 });
        expect(rowsService.getSlotByKey(rows,'live').entity).toEqual({ id: 'live', n: 1 });
    });

    /**
     * WHAT THIS STILL SHOWS, AND WHAT IT HAS STOPPED SHOWING.
     *
     * It was: a mutation the engine never saw cannot move a slot into a bucket
     * nothing filed it into — the bucket's slots were derived from `deckId`, so a
     * `deckId` written behind the engine's back was the one way to make the list
     * and the slot disagree.
     *
     * A bucket's slots are not derived from anything, so that half is true by
     * construction and no longer worth a test: NO write moves a slot between
     * buckets, seen or unseen. What is left is the half this file is actually
     * about — the ENTITY. Under oimInsertEntityWithCopy the engine stores a copy,
     * so the caller's object is not the stored value, and the list a caller composed goes on naming the
     * identities they placed in it whatever they do to the objects they handed
     * in.
     */
    it('under oimInsertEntityWithCopy, a caller mutating behind the engine changes neither the value nor the list', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, {
            entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
            keyOf: (card: TCard) => card.id,
        });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMBucketService<
            TOIMEntitySlot<TCard, TOIMStoreKey>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard, TOIMStoreKey>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>() });
        const byDeck = byDeckService.createStoreSlot(db);
        const item: TCard = { id: 'c1', deckId: 'spades' };
        cardsService.slotContentService.upsertEntity(cards, item);
        const spadesSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        byDeckService.slotContentService.writeBucketMemberSlots(spadesSlot, [cardsService.getSlotByKey(cards, 'c1')]);
        db.flush();

        item.deckId = 'hearts';
        db.flush();

        expect(Array.from(byDeckService.slotContentService.getBucketMemberSlots(spadesSlot)).map((slot) => slot.key)).toEqual(['c1']);
        expect(cardsService.getSlotByKey(cards, 'c1').entity?.deckId).toBe('spades');
        spadesSlot.owner.unholdSlot(spadesSlot);
    });

    it('keeps the stored reference stable across in-place writes', () => {
        const db = new OIMDB();
        const { rowsService, rowsContentService, rows } = copyingInPlaceOn(db);
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        db.flush();
        const stored = rowsService.getSlotByKey(rows,'r1').entity;

        rowsContentService.updateEntity(rowsService.getSlotByKey(rows,'r1'), { n: 2 });
        db.flush();

        // Copying at insert must not have cost the contract every reader shipped
        // with this engine relies on.
        expect(rowsService.getSlotByKey(rows,'r1').entity).toBe(stored);
        expect(stored?.n).toBe(2);
    });
});
