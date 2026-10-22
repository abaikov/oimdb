import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import type { TOIMEntityInsertStrategy } from '../types/TOIMEntityInsertStrategy';

import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { oimClearEntity } from '../utils/oimClearEntity';
import { createOIMEntitySlot } from '../utils/createOIMEntitySlot';
import { oimInsertEntityWithoutCopy } from '../utils/oimInsertEntityWithoutCopy';
import { oimInsertEntityWithSanitizedCopy } from '../utils/oimInsertEntityWithSanitizedCopy';
import { oimIsProtoKey } from '../utils/oimIsProtoKey';
import { oimPatchEntityColumnsGuarded } from '../utils/oimPatchEntityColumnsGuarded';
import { oimPatchEntityColumnGuarded } from '../utils/oimPatchEntityColumnGuarded';
import { oimIsPlain } from '../utils/oimIsPlain';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';
import { OIM_FROZEN_EMPTY_COLUMN_NAMES } from '../constants/OIM_FROZEN_EMPTY_COLUMN_NAMES';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';
import type { IOIMEntityWriter } from '../interfaces/IOIMEntityWriter';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';

const patchNames = (writer: IOIMEntityWriter, slot: TOIMEntitySlot, patch: object): string[] => {
    const changedColumnNames: string[] = [];
    writer.patchEntity(slot, patch, changedColumnNames);
    return changedColumnNames;
};

/**
 * The record is read as data, which is what a strategy sees: every one of the
 * four slots is erased over the entity, and the walks below are by name.
 */
type TRecord = Record<string, unknown>;
type TRecordSlot = TOIMEntitySlot<TRecord, string>;

function emptySlot(): TRecordSlot {
    return createOIMEntitySlot<TRecord, string>('k1', new OIMSlotOwner());
}

/** A slot already holding a record, filed through the strategy under test. */
function filledSlot(writeService: IOIMEntityWriter, item: object = { id: 'k1', title: 'A', score: 1 }): TRecordSlot {
    const slot = emptySlot();
    writeService.fillEntity(slot, item);
    return slot;
}

const inPlace = createOIMEntityWriterInPlace();
const replacing = createOIMEntityWriterReplacing();

const guardedPatch = {
    patchEntityColumns: oimPatchEntityColumnsGuarded,
    patchEntityColumn: oimPatchEntityColumnGuarded,
};
const replacingGuarded = createOIMEntityWriterReplacing(guardedPatch);

const arms: readonly { name: string; writeService: IOIMEntityWriter; guardedWriteService: IOIMEntityWriter }[] = [
    {
        name: 'createOIMEntityWriterInPlace',
        writeService: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithSanitizedCopy }),
        guardedWriteService: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithSanitizedCopy, ...guardedPatch }),
    },
    {
        name: 'createOIMEntityWriterReplacing',
        writeService: createOIMEntityWriterReplacing({ entityInsertStrategy: oimInsertEntityWithSanitizedCopy }),
        guardedWriteService: createOIMEntityWriterReplacing({ entityInsertStrategy: oimInsertEntityWithSanitizedCopy, ...guardedPatch }),
    },
];

describe('the fork: which arm a reader comparing references needs', () => {
    it('the replacing arm hands a reader a new stored object for a write that changed something', () => {
        const slot = filledSlot(replacing);
        const before = slot.entity;

        patchNames(replacing, slot, { title: 'B' });

        expect(slot.entity).not.toBe(before);
        expect(slot.entity).toEqual({ id: 'k1', title: 'B', score: 1 });
        // The object a reader was holding is left exactly as it was, which is
        // what a prev/next diff needs to have something to diff against.
        expect(before).toEqual({ id: 'k1', title: 'A', score: 1 });
    });

    it('the in-place arm keeps one stored object, so a reader comparing references never sees the change', () => {
        const slot = filledSlot(inPlace);
        const before = slot.entity;

        patchNames(inPlace, slot, { title: 'B' });

        expect(slot.entity).toBe(before);
        // The object the reader is holding IS the object that changed. Nothing
        // that decides "did this move?" by reference can tell — such a reader has
        // to be told by the engine and then read, which is what every reader
        // shipped with this engine does.
        expect(before).toEqual({ id: 'k1', title: 'B', score: 1 });
    });

    it('both arms report the same columns as moved — the fork is about the reference, not the report', () => {
        const patch = { title: 'B', score: 1 };
        const movedInPlace = patchNames(inPlace, filledSlot(inPlace), patch);
        const movedReplacing = patchNames(replacing, filledSlot(replacing), patch);

        // `score` is written with the value it already holds, so it is not a
        // move on either arm: the predicate decides that, and both arms hold the
        // same one.
        expect(movedInPlace).toEqual(['title']);
        expect(movedReplacing).toEqual(['title']);
    });

    it('the replacing arm allocates once per write that changed something, not once per record', () => {
        const slot = filledSlot(replacing);

        patchNames(replacing, slot, { title: 'B' });
        const afterFirst = slot.entity;
        patchNames(replacing, slot, { title: 'C' });

        // The strategy's own doc prices this as "one allocation per changed slot
        // per frame" (createOIMEntityWriterReplacing.ts). At THIS level there is no frame: two
        // writes that change something are two objects, and coalescing them to
        // one per frame is the collection layer's job, not this file's.
        expect(slot.entity).not.toBe(afterFirst);
        expect(slot.entity).toEqual({ id: 'k1', title: 'C', score: 1 });
    });

    it('the two arms agree on the two ends of a record\'s life, by naming the same two functions', () => {
        // Not "behave the same": they ARE the same function objects. A first
        // value has nothing to compare against and a departing one has nothing to
        // keep, so the question the fork exists to answer has no content at
        // either end — see oimInsertEntityWithoutCopy.ts and oimClearEntity.ts.
        expect(inPlace.fillEntity).toBe(oimInsertEntityWithoutCopy);
        expect(replacing.fillEntity).toBe(oimInsertEntityWithoutCopy);
        expect(inPlace.clearEntity).toBe(oimClearEntity);
        expect(replacing.clearEntity).toBe(oimClearEntity);
    });

    it('a writer is six column doors, nothing else', () => {
        for (const { writeService } of arms) {
            expect(Object.keys(writeService).sort())
                .toEqual(['clearEntity', 'deleteColumns', 'fillEntity', 'patchColumn', 'patchEntity', 'putEntity']);
        }
    });
});

for (const { name, writeService, guardedWriteService } of arms) {
    describe(`${name}: what a patch does`, () => {
        it('reports the columns whose values actually moved and no others', () => {
            const slot = filledSlot(writeService);

            expect(patchNames(writeService, slot, { title: 'B', score: 2 })).toEqual(['title', 'score']);
            expect(slot.entity).toEqual({ id: 'k1', title: 'B', score: 2 });
        });

        it('adds a column the record did not carry', () => {
            const slot = filledSlot(writeService);

            expect(patchNames(writeService, slot, { colour: 'red' })).toEqual(['colour']);
            expect(slot.entity).toEqual({ id: 'k1', title: 'A', score: 1, colour: 'red' });
        });

        it('reports nothing and keeps the stored object when the patch changes nothing', () => {
            const slot = filledSlot(writeService);
            const before = slot.entity;

            const changed = writeService.patchEntity(slot, { title: 'A', score: 1 }, undefined);

            // An unchanged write answers false and, on the replacing arm, makes no
            // record either: it must not hand readers a new reference.
            expect(changed).toBe(false);
            expect(slot.entity).toBe(before);
        });

        it('reports nothing for an empty patch', () => {
            const slot = filledSlot(writeService);
            const before = slot.entity;

            expect(patchNames(writeService, slot, {})).toEqual([]);
            expect(slot.entity).toBe(before);
        });

        it('does nothing at all to a slot that holds no record', () => {
            const slot = emptySlot();

            // A patch cannot mint a record: `update` takes a `Partial`, so a
            // patch filed as a whole record would mint a slot with no primary key
            // on any update following a remove. `fillSlot` is the only door with
            // a whole entity to file — see IOIMEntityWriter.fillEntity.
            expect(patchNames(writeService, slot, { title: 'B' })).toEqual([]);
            expect(oimIsSlotEmpty(slot)).toBe(true);
        });

        it('calls a column holding NaN unmoved when the same NaN is written back', () => {
            const slot = filledSlot(writeService, { id: 'k1', score: NaN });
            const before = slot.entity;

            // SameValueZero, not `===`. Under `===` this reported a move every
            // frame for ever — and on the replacing arm every one of them
            // allocated a record and re-rendered every reference-comparing
            // reader. See oimSameValueZeroGuard and createOIMEntityWriterReplacing.ts, "IT MATTERS MOST
            // ON THIS HALF".
            expect(patchNames(writeService, slot, { score: NaN })).toEqual([]);
            expect(slot.entity).toBe(before);
        });
    });

    describe(`${name}: what a removal does`, () => {
        it('reports the columns that were actually there', () => {
            const slot = filledSlot(writeService);

            expect(writeService.deleteColumns(slot, ['title', 'never-was'])).toEqual(['title']);
            expect(slot.entity).toEqual({ id: 'k1', score: 1 });
        });

        it('reports nothing and keeps the stored object when nothing was there to remove', () => {
            const slot = filledSlot(writeService);
            const before = slot.entity;

            // "A removal that removes nothing must not hand readers a new
            // reference" — the same rule the unchanged patch obeys above.
            expect(writeService.deleteColumns(slot, ['never-was'])).toBe(OIM_FROZEN_EMPTY_COLUMN_NAMES);
            expect(slot.entity).toBe(before);
        });

        it('leaves a record behind when its last column goes, because that is not the same as holding none', () => {
            const slot = filledSlot(writeService, { id: 'k1' });

            expect(writeService.deleteColumns(slot, ['id'])).toEqual(['id']);
            // `deleteColumns` can only ever leave a record BEHIND. `undefined` is
            // how this engine spells "there is no value", and only `clearSlot`
            // says it — IOIMEntityWriter.clearEntity.
            expect(slot.entity).toEqual({});
        });

        it('does nothing at all to a slot that holds no record', () => {
            const slot = emptySlot();

            expect(writeService.deleteColumns(slot, ['title'])).toBe(OIM_FROZEN_EMPTY_COLUMN_NAMES);
            expect(oimIsSlotEmpty(slot)).toBe(true);
        });
    });

    describe(`${name}: what the store owns`, () => {
        it('stores a copy, so mutating what you passed in never reaches the stored record', () => {
            const handedIn = { id: 'k1', title: 'A' };
            const slot = emptySlot();

            writeService.fillEntity(slot, handedIn);
            handedIn.title = 'edited behind the engine\'s back';

            // "An engine that delivers changes cannot hold a slot somebody else
            // can edit behind its back" — oimInsertEntityWithSanitizedCopy.ts. Copying on the insert
            // branch only is what this refuses: two callers writing the same code
            // would then get different behaviour depending on whether the key
            // happened to have a value yet.
            expect(slot.entity).not.toBe(handedIn);
            expect(slot.entity).toEqual({ id: 'k1', title: 'A' });
        });

        it('stores plain data, so a record handed in as a class instance keeps its fields and loses its prototype', () => {
            class CardRecord {
                public constructor(public readonly id: string, public readonly title: string) {}
                public shout(): string { return this.title.toUpperCase(); }
            }
            const slot = emptySlot();

            writeService.fillEntity(slot, new CardRecord('k1', 'A'));

            expect(slot.entity).toEqual({ id: 'k1', title: 'A' });
            // A spread copies own enumerable properties, and a class's methods
            // are neither. The engine treats a record as data everywhere else
            // already, so keeping a prototype here would be one path promising
            // something no other path can keep — oimInsertEntityWithSanitizedCopy.ts.
            expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
            expect(slot.entity?.shout).toBeUndefined();
        });

        it('takes the value away entirely and leaves the identity standing', () => {
            const slot = filledSlot(writeService);
            (slot as TOIMSlotEditable<typeof slot>).holdCount = 3;

            writeService.clearEntity(slot);

            expect(oimIsSlotEmpty(slot)).toBe(true);
            // The identity outlives its value: the key, the holds, the
            // subscribers and the owner are untouched here — clearSlot.ts.
            expect(slot.key).toBe('k1');
            expect(slot.holdCount).toBe(3);
            expect(slot.effects).toBeUndefined();
        });
    });

    describe(`${name}: what a patch's own properties are, under the guarded patch`, () => {
        it('reads a patch\'s own names and refuses the ones it inherited', () => {
            const patch: TRecord = Object.create({ inheritedColumn: 'from the prototype' }) as TRecord;
            patch.title = 'B';
            const slot = filledSlot(guardedWriteService);

            const moved = patchNames(guardedWriteService, slot, patch);

            // `Partial<TEntity>` accepts a class instance, so a `for...in` over a
            // patch can yield names the patch does not own. Reported and never
            // applied, they woke subscribers for a value that never landed and
            // were reported again on the next write, for ever. `oimIsPlain` asks the
            // question once per write instead of once per field.
            expect(moved).toEqual(['title']);
            expect(slot.entity).toEqual({ id: 'k1', title: 'B', score: 1 });
            expect('inheritedColumn' in (slot.entity ?? {})).toBe(false);
        });

        it('takes every name of a patch made with no prototype at all', () => {
            const patch: TRecord = Object.create(null) as TRecord;
            patch.title = 'B';
            const slot = filledSlot(writeService);

            // `oimIsPlain` is true for a null-prototype object as well as for a
            // literal: in both, a `for...in` is already own-properties-only, so
            // the per-field check is skipped.
            expect(patchNames(writeService, slot, patch)).toEqual(['title']);
            expect(slot.entity).toEqual({ id: 'k1', title: 'B', score: 1 });
        });
    });

    describe(`${name}: the default patch is unguarded`, () => {
        it('reports and applies a name the patch only inherited', () => {
            const patch: TRecord = Object.create({ inheritedColumn: 'from the prototype' }) as TRecord;
            patch.title = 'B';
            const slot = filledSlot(writeService);

            expect(patchNames(writeService, slot, patch)).toEqual(['title', 'inheritedColumn']);
            expect(slot.entity?.inheritedColumn).toBe('from the prototype');
        });

        it('reports an own `__proto__` as a moved column', () => {
            const slot = filledSlot(writeService);

            expect(patchNames(writeService, slot, JSON.parse('{"__proto__":{"x":1},"title":"B"}') as TRecord))
                .toEqual(['__proto__', 'title']);
            expect({}.constructor.prototype).not.toHaveProperty('x');
        });
    });

    describe(`${name}: what may not be a column, under the guarded patch`, () => {
        /** An own, enumerable `__proto__` — what JSON.parse yields for the name. */
        const polluting = (): TRecord =>
            JSON.parse('{"__proto__":{"polluted":"yes"},"title":"B"}') as TRecord;

        it('drops `__proto__` at the door where a first value is filed', () => {
            const slot = emptySlot();

            writeService.fillEntity(slot, polluting());

            expect(slot.entity).toEqual({ title: 'B' });
            expect(Object.keys(slot.entity ?? {})).not.toContain('__proto__');
            expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
            expect({}.constructor.prototype).not.toHaveProperty('polluted');
        });

        it('never reports `__proto__` as a moved column, and applies the rest of the patch', () => {
            const slot = filledSlot(guardedWriteService);

            const moved = patchNames(guardedWriteService, slot, polluting());

            expect(moved).toEqual(['title']);
            expect(slot.entity).toEqual({ id: 'k1', title: 'B', score: 1 });
            expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
            expect({}.constructor.prototype).not.toHaveProperty('polluted');
        });

        it('treats a patch whose only name is `__proto__` as a patch that changed nothing', () => {
            const slot = filledSlot(guardedWriteService);
            const before = slot.entity;

            // Nothing changed, so nothing is written and — on the replacing arm —
            // nothing is allocated, which is the same answer the in-place half
            // gives. Skipped rather than thrown on: throwing would let anyone who
            // can put a key into a payload abandon a batch mid-write, and the
            // caller most exposed to a hostile payload is the one who can least
            // afford that. See oimIsProtoKey.ts.
            expect(patchNames(guardedWriteService, slot, JSON.parse('{"__proto__":{"x":1}}') as TRecord)).toEqual([]);
            expect(slot.entity).toBe(before);
        });

        it('never reports `__proto__` as a removed column', () => {
            const slot = filledSlot(writeService);
            const before = slot.entity;

            // `'__proto__' in entity` is true of every plain object whether or
            // not the record ever carried the name, so a removal naming it would
            // report a removal on every slot of the collection and wake every
            // subscriber watching it — and `delete` could not have made the
            // report true.
            expect(writeService.deleteColumns(slot, ['__proto__'])).toBe(OIM_FROZEN_EMPTY_COLUMN_NAMES);
            expect(slot.entity).toBe(before);
        });
    });
}

describe('what the skip in oimOwnedColumnNames is load-bearing for', () => {
    const fillDefiningAnOwnProtoKey: TOIMEntityInsertStrategy = (slot, entity) => {
        const stored = { ...entity } as Record<string, unknown>;
        Object.defineProperty(stored, '__proto__', {
            value: { injected: true }, enumerable: true, writable: true, configurable: true,
        });
        (slot as TOIMSlotEditable<typeof slot>).entity = stored as never;
    };

    for (const { name, writeService } of arms) {
        it(`${name}: the own-name guard, not the skip, is what keeps an ordinary row quiet`, () => {
            const slot = filledSlot(writeService);
            expect(Object.prototype.hasOwnProperty.call(slot.entity as object, '__proto__')).toBe(false);
            expect('__proto__' in (slot.entity as object)).toBe(true);
        });
    }

    it('leaves an own `__proto__` on the row with no door to take it off', () => {
        const writeService = createOIMEntityWriterInPlace({ entityInsertStrategy: fillDefiningAnOwnProtoKey });
        const slot = filledSlot(writeService, { id: 'k1', title: 'A' });
        expect(Object.prototype.hasOwnProperty.call(slot.entity as object, '__proto__')).toBe(true);

        expect(writeService.deleteColumns(slot, ['__proto__'])).toBe(OIM_FROZEN_EMPTY_COLUMN_NAMES);
        expect(Object.prototype.hasOwnProperty.call(slot.entity as object, '__proto__')).toBe(true);
    });
});

describe('the rule about column names, and the rule about a patch\'s own names', () => {
    it('refuses exactly one name, and nothing else', () => {
        expect(oimIsProtoKey('__proto__')).toBe(true);
        expect(oimIsProtoKey('title')).toBe(false);
        expect(oimIsProtoKey('constructor')).toBe(false);
        expect(oimIsProtoKey('prototype')).toBe(false);
        // A comparison chain, deliberately: these loops are the hottest path in
        // the engine, and the names a `for...in` yields are interned, so this is
        // a pointer compare. See oimIsProtoKey.ts.
        expect(oimIsProtoKey('')).toBe(false);
    });

    it('calls an object plain when every name a walk yields is its own', () => {
        expect(oimIsPlain({})).toBe(true);
        expect(oimIsPlain(Object.create(null) as object)).toBe(true);
        expect(oimIsPlain(JSON.parse('{"a":1}') as object)).toBe(true);
        expect(oimIsPlain(Object.create({}) as object)).toBe(false);
        expect(oimIsPlain(new (class {})())).toBe(false);
    });

    it('says nothing changed without allocating anything to say it', () => {
        expect(OIM_FROZEN_EMPTY_COLUMN_NAMES).toHaveLength(0);
        // Frozen so a caller outside this engine cannot start keeping it.
        expect(Object.isFrozen(OIM_FROZEN_EMPTY_COLUMN_NAMES)).toBe(true);
    });
});

describe('the replacing arm rebuilds a record, and what the rebuild refuses to carry over', () => {
    it('rebuilds with a plain spread, so a hand-planted own `__proto__` is carried as data and never assigned', () => {
        const slot = emptySlot();
        // Reached into by hand, which is the case the rebuild's own comment names
        // — "a slot a caller reached into by hand, a slot restored from a
        // snapshot". No write of this engine puts such a name in a record.
        (slot as TOIMSlotEditable<typeof slot>).entity = JSON.parse('{"id":"k1","title":"A","__proto__":{"x":1}}') as TRecord;

        expect(replacing.deleteColumns(slot, ['title'])).toEqual(['title']);

        // The rebuild is a plain spread: the own `__proto__` is carried as data, no setter runs.
        expect(Object.keys(slot.entity ?? {})).toEqual(['id', 'title', '__proto__']);
        expect(slot.entity?.title).toBeUndefined();
        expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
    });

    it('rebuilds from the stored record\'s own columns and leaves its inherited ones behind', () => {
        const slot = emptySlot();
        const planted: TRecord = Object.create({ inheritedColumn: 'from the prototype' }) as TRecord;
        planted.id = 'k1';
        planted.title = 'A';
        (slot as TOIMSlotEditable<typeof slot>).entity = planted;

        expect(replacing.deleteColumns(slot, ['title'])).toEqual(['title']);

        // What is rebuilt has to be what a spread of the record would have been,
        // minus the removed names — and a spread takes own properties only.
        expect(slot.entity).toEqual({ id: 'k1' });
        expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
    });

    it('rebuilds a patched record by filtering rather than by spreading when the patch named something that may not be a column', () => {
        const slot = filledSlot(replacingGuarded);
        const before = slot.entity;

        const moved = patchNames(
            replacingGuarded,
            slot, JSON.parse('{"__proto__":{"x":1},"title":"B","score":9}') as TRecord,
        );

        // The rare branch: a spread of the patch would have put `__proto__` into
        // the record as data, where the removal rebuild above would later assign
        // it and call the setter. So this walks the patch a second time and
        // copies only what may be a column — paid for by the payload that
        // carried the name, not by everyone.
        expect(moved).toEqual(['title', 'score']);
        expect(slot.entity).not.toBe(before);
        expect(slot.entity).toEqual({ id: 'k1', title: 'B', score: 9 });
        expect(Object.keys(slot.entity ?? {})).not.toContain('__proto__');
        expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
    });

    it('refuses the patch\'s inherited names in the rebuild too, not only in the walk that decides', () => {
        const patch: TRecord = Object.create({ inheritedColumn: 'from the prototype' }) as TRecord;
        patch.title = 'B';
        // `Object.defineProperty` defines an own data property rather than
        // calling the `__proto__` setter, which is what a JSON payload's own
        // enumerable `__proto__` looks like — on an object that ALSO has a
        // prototype, so both filters have to run in the same walk.
        Object.defineProperty(patch, '__proto__', {
            value: { polluted: 'yes' }, enumerable: true, writable: true, configurable: true,
        });
        const slot = filledSlot(replacingGuarded);

        expect(patchNames(replacingGuarded, slot, patch)).toEqual(['title']);
        expect(slot.entity).toEqual({ id: 'k1', title: 'B', score: 1 });
        expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
    });
});

describe('a strategy built with a `held` of the caller\'s own', () => {
    it('asks that `held` what counts as a change, on both arms', () => {
        // Case-insensitive: two titles differing only in case are the same value
        // to this consumer, so neither arm writes, reports or allocates.
        const caseless = (a: unknown, b: unknown): boolean =>
            typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b;

        const inPlaceCaseless = createOIMEntityWriterInPlace({ sameValueGuard: caseless });
        const replacingCaseless = createOIMEntityWriterReplacing({ sameValueGuard: caseless });
        const one = filledSlot(inPlaceCaseless);
        const two = filledSlot(replacingCaseless);
        const storedByTwo = two.entity;

        expect(patchNames(inPlaceCaseless, one, { title: 'a' })).toEqual([]);
        expect(patchNames(replacingCaseless, two, { title: 'a' })).toEqual([]);
        expect(one.entity).toEqual({ id: 'k1', title: 'A', score: 1 });
        expect(two.entity).toBe(storedByTwo);
    });
});

describe('both arms of the fork answer a patch the same way', () => {
    /**
     * THE DIVERGENCE THIS PINS. A `held` answers "did this change"; when it
     * says no, nothing changed, and the slot must keep what it holds.
     * `createOIMEntityWriterInPlace` did that — the `continue` above its assignment. The replacing
     * arm ended in `slot.entity = { ...entity, ...source }`, which put the newer
     * object in anyway, so the SAME patch through the SAME collection code left
     * two different values behind depending only on which strategy the caller had
     * constructed with. `changedColumns`'s header forbids exactly that: "a caller
     * must not be able to get two of them by choosing a strategy".
     */
    it('leaves a column `held` called equal untouched, whichever arm is used', () => {
        // Two objects are always "equal" to this `held`, numbers are not.
        const bothObjects = (prev: unknown, next: unknown): boolean =>
            typeof prev === 'object' && prev !== null && typeof next === 'object' && next !== null;

        const kept = { id: 1 };
        const arriving = { id: 2 };

        const inPlace = createOIMEntityWriterInPlace({ sameValueGuard: bothObjects });
        const slotA = { entity: { n: 1, tags: kept } } as unknown as Parameters<typeof inPlace.patchEntity>[0];
        const movedA = patchNames(inPlace, slotA, { n: 2, tags: arriving });

        const replacing = createOIMEntityWriterReplacing({ sameValueGuard: bothObjects });
        const slotB = { entity: { n: 1, tags: kept } } as unknown as Parameters<typeof replacing.patchEntity>[0];
        const movedB = patchNames(replacing, slotB, { n: 2, tags: arriving });

        expect([...movedA]).toEqual(['n']);
        expect([...movedB]).toEqual(['n']);

        expect((slotA.entity as { tags: unknown }).tags).toBe(kept);
        expect((slotB.entity as { tags: unknown }).tags).toBe(kept);

        expect((slotA.entity as { n: number }).n).toBe(2);
        expect((slotB.entity as { n: number }).n).toBe(2);
    });
});
