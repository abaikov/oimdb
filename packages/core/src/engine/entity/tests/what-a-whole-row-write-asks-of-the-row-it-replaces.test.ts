import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';

/** Five columns, so a per-column count and a per-row count are different numbers. */
type TCard = { id: string; deckId: string; title: string; rank: number; note?: string };

const COLUMNS = 5;

type TAsked = {
    /** `in` — `[[HasProperty]]`. */
    has: number;
    /** The start of one `for…in` over this object. */
    walks: number;
    /** "Is this key enumerable" — at least one per key of a walk. */
    descriptors: number;
    gets: number;
    sets: number;
    deletes: number;
};

const nothingAsked = (): TAsked =>
    ({ has: 0, walks: 0, descriptors: 0, gets: 0, sets: 0, deletes: 0 });

/**
 * The same object, answering every question it is asked and tallying it.
 *
 * A `Proxy` and not a wrapper, because the subject is what the ENGINE does to a
 * row it was handed and to the row it already stored — both are ordinary records
 * to it, and anything that changed their shape would change the walk being
 * counted.
 */
const asked = <T extends object>(target: T, tally: TAsked): T => new Proxy(target, {
    has: (t, key) => { tally.has++; return Reflect.has(t, key); },
    ownKeys: (t) => { tally.walks++; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor: (t, key) => {
        tally.descriptors++;
        return Reflect.getOwnPropertyDescriptor(t, key);
    },
    get: (t, key) => { tally.gets++; return Reflect.get(t, key) as unknown; },
    set: (t, key, value) => { tally.sets++; return Reflect.set(t, key, value); },
    deleteProperty: (t, key) => { tally.deletes++; return Reflect.deleteProperty(t, key); },
});

const createFixture =() => {
    const db = new OIMDB();
    const collectionService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const collection = collectionService.createStoreSlot(db);
    return { db, collectionService, collection };
};

const row = (): TCard => ({ id: 'a', deckId: 'd0', title: 'A', rank: 1, note: 'n' });

/**
 * A collection holding one row, with the STORED record swapped for one that
 * counts. The swap is after the fill, because the stored record is built inside
 * `fillSlot` and there is nothing to wrap before it exists.
 */
const oneStoredRow = () => {
    const { db, collectionService, collection } = createFixture();
    collectionService.slotContentService.upsertEntity(collection,row());
    db.flush();
    const slot = collectionService.getSlotByKey(collection,'a')!;
    const stored = nothingAsked();
    (slot as TOIMSlotEditable<typeof slot>).entity = asked(slot.entity as TCard, stored);
    return { db, collectionService, collection, slot, stored };
};

describe('the ordinary re-send — the same columns arriving again', () => {
    it('enumerates the stored row once and asks the incoming row about every column', () => {
        const { collectionService, collection, slot, stored } = oneStoredRow();
        const incoming = nothingAsked();

        collectionService.slotContentService.upsertEntity(collection,asked(row(), incoming));

        // ─── THE DEPARTURE WALK, which produced nothing ───────────────────
        // One `for…in` over the stored row, and one own-property probe per
        // column of it against the incoming row. The probe count is the claim:
        // it is per COLUMN and it is paid on a write where no column left.
        expect(stored.walks).toBe(1);
        // `hasOwnProperty` is `[[GetOwnProperty]]`, so the probe lands in the
        // descriptor trap and never in `has`; `changedColumns`'s own walk of the
        // incoming row spends COLUMNS more on the enumeration.
        expect(incoming.has).toBe(0);
        expect(incoming.descriptors).toBe(2 * COLUMNS);
        // A walk must ask each key whether it is enumerable. At least one per
        // key, and the count is not pinned tighter than the specification
        // guarantees — the subject is that it is per column, not which
        // bookkeeping a given engine adds on top.
        expect(stored.descriptors).toBeGreaterThanOrEqual(COLUMNS);

        // ─── AND IT ALLOCATED NOTHING, which the comment claims and which is
        // ─── true: no names array, so no call into the removal half, so no
        // ─── delete and no second walk of the stored row.
        expect(stored.deletes).toBe(0);
        expect(stored.has).toBe(0);
        expect(stored.sets).toBe(0);

        // ─── WHAT THE WRITE COSTS ANYWAY, so the walk above is read against
        // ─── it. `changedColumns` walks the INCOMING row and reads both rows
        // ─── once per column of it; the pk selector reads the incoming row
        // ─── once more.
        expect(incoming.walks).toBe(1);
        expect(stored.gets).toBe(COLUMNS);
        expect(incoming.gets).toBe(COLUMNS + 1);

        // Nothing changed, so nothing was written.
        expect(slot.entity).toEqual(row());
    });

    it('wakes nobody, which is what makes the walk pure cost on this arm', () => {
        const { db, collectionService, collection, slot } = oneStoredRow();
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { runs++; });
        db.flush();
        const born = runs;

        collectionService.slotContentService.upsertEntity(collection,row());
        db.flush();

        expect(runs).toBe(born);
    });
});

describe('the arm the walk exists for — a column that left', () => {
    it('finds the one name and does not ask the stored row about it again', () => {
        const { collectionService, collection, slot, stored } = oneStoredRow();
        const incoming = nothingAsked();
        const withoutNote: TCard = { id: 'a', deckId: 'd0', title: 'A', rank: 1 };

        collectionService.slotContentService.upsertEntity(collection,asked(withoutNote, incoming));

        // The same walk as the quiet arm: one enumeration, one probe per stored
        // column. It is the same price for an answer that is not empty.
        expect(stored.walks).toBe(1);
        expect(incoming.has).toBe(0);
        expect(incoming.descriptors).toBe(COLUMNS + (COLUMNS - 1));

        // The departing name came from the walk itself, so `putEntity` does not probe it again.
        expect(stored.has).toBe(0);
        expect(stored.descriptors).toBe(COLUMNS);
        expect(stored.deletes).toBe(0);
        expect(stored.sets).toBe(1);

        // `changedColumns` then walks the four columns that arrived.
        expect(incoming.walks).toBe(1);
        expect(incoming.gets).toBe(COLUMNS - 1 + 1);
        expect(stored.gets).toBe(COLUMNS - 1 + 1);

        expect(slot.entity).toEqual(withoutNote);
    });

    it('wakes the readers of the slot once, however many halves the write took', () => {
        const { db, collectionService, collection, slot } = oneStoredRow();
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { runs++; });
        db.flush();
        const born = runs;

        // The removal half reports, and so would the patch half — marking is
        // idempotent per frame, so the reader is owed one run and not two.
        collectionService.slotContentService.upsertEntity(collection,{ id: 'a', deckId: 'd0', title: 'A2', rank: 1 });
        db.flush();

        expect(runs).toBe(born + 1);
    });
});
