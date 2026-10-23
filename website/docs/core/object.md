---
sidebar_position: 10
description: How to keep a keyless record such as settings or a session as a store slot of a single entity service, how it stores the object you hand it, and what the frame guard refuses.
---

# Standalone records

A standalone record is one identity with no key and no collection —
settings, a session, a view model. It is the single of the entity pair: a store
slot of `createOIMSingleEntityService(db)` — an `OIMSingleSlotService` over an entity content service keyed
by `void` over `OIMSlotStoreServiceSingleSlotDriven.INSTANCE` — made by `createStoreSlot(db)` and filled by
`upsertEntity`. The other half of the pair is a [collection](/docs/core/collections), a store slot of a
keyed entity collection.

<InShort>

- A standalone record is a store slot of a single entity service: one identity, no key, no collection.
- Take it for one value the program shares, that something subscribes to, and that nobody looks up by key.
- Values told apart by a key are a collection, and a value derived from other slots is a single computed.
- By default the object you hand it is stored as handed, and the frame guard refuses writes while a flush is running.

</InShort>

Use it for one value the program shares, that something subscribes to,
and that nobody looks up by key. Values told apart by a key are a
collection — even if there are only two of them, because a collection is what
mints, files and releases identities per key. A value *derived* from other slots
is a [single computed](/docs/core/computed-effects#one-derivation-no-key), not a record you keep
writing.

```typescript setup
import {
    OIMDB,
    OIMEffectService,
    OIMSlotStoreServiceSingleSlotDriven,
    oimInsertEntityWithCopy,
    createOIMComputedService,
    createOIMEntityWriterInPlace,
    createOIMEntityWriterReplacing,
    createOIMSingleEntityService,
    type TOIMComputedSlot,
    type TOIMSingleSlotStore,
} from '@oimdb/core';

type Settings = { theme: string; fontSize: number; sidebar?: boolean };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const settingsService = createOIMSingleEntityService<Settings>(db);
const settings = settingsService.createStoreSlot(db);
const settingsContentService = settingsService.slotContentService;
settingsContentService.upsertEntity(settings, { theme: 'dark', fontSize: 14 });
const settingsSlot = settingsService.getSingleSlot(settings);
```

The service is built once, and each `createStoreSlot(db)` is one record. It mints nothing: the
record's first value arrives through `upsertEntity(storeSlot, entity)`, an ordinary write that is
announced to the channel like any other, and until then `findSingleSlot(storeSlot)`
answers `undefined`.

`createOIMSingleEntityService(db, options?)` takes `entityWriter`, `slotEmptiness`, `slotReleasePolicy`,
`columnSlotStoreService` and `columnNames`, each optional and coming from the db and the defaults when you
leave them out. `columnNames` names the columns, files their slots in the ordinal store
`OIMColumnSlotStoreServiceOrdinalDriven` and types `getColumn`, `holdColumn` and `getColumnGroup` on those names.
The base layer it assembles is
`createOIMSingleSlotService({ slotContentService: createOIMSlotContentEntityService(db, { slotStoreService: OIMSlotStoreServiceSingleSlotDriven.INSTANCE }) })`.
The column doors are the single slot service's: `getColumn(slot, columnName)`, `holdColumn(slot, columnName)`,
`getColumnGroup(names)`, `holdColumnGroup(slot, group)`, `getAnyColumn(slot)`, `holdAnyColumn(slot)` and
`unholdColumn(columnSlot)` — with the record's slot as the slot.

The record owns one slot, and it is read through the single doors:
`settingsService.getSingleSlot(settings)` hands it back, and mints it if none is filed;
`settingsService.holdSingleSlot(settings)` hands it back held;
`settingsService.findSingleSlot(settings)` answers it without minting, and `hasSingleSlotContent(settings)`
whether it holds a value. The slot is a plain `TOIMEntitySlot`, the same shape a collection files —
`.entity` is the stored value, `.effects` its subscribers — so there is no handle to resolve and nothing to
look up. Its owner is the content service's slot owner, and it is released under the release policy like any
other entity slot: under the default `OIMSlotReleasePolicyAtEmpty`
it stays while it has a value or something holds it, and a record given
`OIMSlotReleasePolicyNever.INSTANCE` keeps it for good. Once released, the next get or hold mints a fresh slot,
exactly as a collection mints a key again.
Everything that reads an entity slot reads this one — an effect over it, or over one
of its columns, or a computed that names it as a source.

```typescript
effectService.createEffect(db, [settingsSlot], [], () => { console.log(settingsSlot.entity?.theme); });
effectService.createEffect(db, [settingsService.holdColumn(settingsSlot, 'fontSize')], [], () => {
    console.log(settingsSlot.entity?.fontSize);
});

const fontLabelService = createOIMComputedService<void, string, TOIMSingleSlotStore<TOIMComputedSlot<string, void>>>({
    computedSlotStoreService:
        OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<string, void>>,
});
const fontLabel = fontLabelService.createComputedStoreSlot(
    db,
    () => `${settingsSlot.entity?.fontSize ?? 0}px`,
    () => ({ sourceSlots: [settingsSlot] }),
);
const fontLabelSlot = fontLabelService.computedCollectionService.getSlotByKey(fontLabel, undefined);
fontLabelSlot.computedValueService.getValueForSlot(fontLabelSlot);
```

An effect on a column takes the column slot as its root.
`settingsService.holdColumn(settingsSlot, name)` is what mints it and holds it. `settingsService.unholdColumn(column)`
gives the hold back, and the column slot goes once nothing holds it and no effect is filed on it. An
effect on a column runs only when a write moved that column; an effect on the
record runs on any write that moved something.

## Writing

```typescript
settingsContentService.updateEntity(settingsSlot, { theme: 'light' });                // patch: named columns move
settingsContentService.deleteEntityColumns(settingsSlot, ['sidebar']);                // the thing a patch cannot say
settingsContentService.writeEntity(settingsSlot, { theme: 'dark', fontSize: 16 });   // becomes exactly this
db.flush();
```

| Method | Writer call | What moves |
|---|---|---|
| `updateEntity(slot, patch)` | `patchEntity` (PATCH) | the columns the patch names whose value differs |
| `updateEntityColumn(slot, columnName, value)` | `patchColumn` | that column, if its value differs |
| `deleteEntityColumns(slot, names)` | `deleteColumns` | the named columns the record holds with a value other than `undefined` |
| `writeEntity(slot, next)` | `putEntity` (PUT) | the columns that differ, plus the columns the record had and `next` does not |

These are the slot doors of the entity content service, the same ones a collection's slots take: none of
them takes a store slot, because the slot carries the one it is filed in. A write that moved nothing
wakes nobody. Whether a column moved is the writer's `sameValueGuard`, `oimSameValueZeroGuard` by
default. Delivery happens at the next `db.flush()`.

`writeEntity` is what restoring a saved state needs: a patch alone leaves behind
every key that was deleted before the snapshot was taken, so a plain load quietly
resurrects them. It reads the own properties of a value that is an instance of
a class, so the prototype's names are not reported as columns.

Under both writers a column that leaves — named in `deleteEntityColumns`, or dropped by
`writeEntity` — is written `undefined` rather than deleted (in place, or into the
replacing writer's copy), so the stored object keeps its shape; a column holding
`undefined` counts as absent. See [Writing](/docs/core/writing#which-strategy-to-pick).

A misspelt column in `deleteEntityColumns` is a compile error naming the column — its
parameter is `readonly TOIMEntityColumnName<TEntity>[]`.

## The writer

Every store slot has a channel (see
[Every collection has a channel](/docs/core/model#every-collection-has-a-channel)).
A record nobody subscribes to still pays, per write that moved something, the column
marking and the one channel write. The writer is the `entityWriter` option of the service,
so every record of one service shares it:

```typescript
const initial: Settings = { theme: 'dark', fontSize: 14 };

const inPlaceSettingsService = createOIMSingleEntityService<Settings>(db, {
    entityWriter: createOIMEntityWriterInPlace(),   // the stored object keeps its identity
});
inPlaceSettingsService.slotContentService.upsertEntity(inPlaceSettingsService.createStoreSlot(db), initial);

const replacingSettingsService = createOIMSingleEntityService<Settings>(db, {
    entityWriter: createOIMEntityWriterReplacing(), // a new object per changed write
});
replacingSettingsService.slotContentService.upsertEntity(replacingSettingsService.createStoreSlot(db), initial);
```

Use the in-place writer when readers are effects; use the replacing one when a
reader decides "did it change?" by comparing the slot's `entity` to the last one it
saw. Name no writer and the db's answers, then `OIMDefaults.ENTITY_WRITER.getValue()`, which is
`createOIMEntityWriterInPlace()` unless it was set at startup.

## The object you hand it is stored as handed — by default

The first value, upserted while no slot is filed, goes through the writer's `fillEntity`. Both writer factories
default it to `oimInsertEntityWithoutCopy`, which stores your object itself. With the
in-place writer a later update edits that same object. If you keep your own reference
and mutate it, the stored value changes without telling anyone: no `sameValueGuard`
runs, no frame opens, nobody is woken.

When the caller must keep its object untouched, `oimInsertEntityWithCopy` stores a
shallow copy (`{ ...entity }`), one level deep: a nested object is shared with
the value you handed in.

```typescript
const copyingSettingsService = createOIMSingleEntityService<Settings>(db, {
    entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
});
copyingSettingsService.slotContentService.upsertEntity(copyingSettingsService.createStoreSlot(db), { theme: 'dark', fontSize: 14 });
```

For untrusted JSON, `oimInsertEntityWithSanitizedCopy` also removes an own `__proto__`
key from the copy; for later writes take the guarded walk arms
(`patchEntityColumns: oimPatchEntityColumnsGuarded`, `patchEntityColumn: oimPatchEntityColumnGuarded`,
`putEntityColumns: oimPutEntityColumnsGuarded`), which skip that name.

## The frame guard

A write during a flush, or to a released slot, throws before any column changes. The flush
includes `onBeforeFlush` and the after-each-frame handlers, so a write in response to a change
happens after `flush()` has returned. See [the frame](/docs/core/model#the-frame).

## Where to next

<DocCards>
<DocCard to="/docs/core/collections" title="Collections and identities">The other half of the entity pair.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">The two writers.</DocCard>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Which reads mint a slot, and how to build an effect.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Deriving from a record.</DocCard>
</DocCards>
