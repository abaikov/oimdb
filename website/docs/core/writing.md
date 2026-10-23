---
sidebar_position: 3
description: Which write door of an entity content service to call, what each write wakes, and how to choose between the in-place and replacing writers.
---

# Writing

```ts setup
import {
    OIMDB,
    OIMEffectService,
    oimInsertEntityWithCopy,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMEntityWriterReplacing,
    createOIMSingleEntityService,
    oimPatchEntityColumn,
    oimPatchEntityColumns,
    oimPutEntityColumns,
    oimSameValueZeroGuard,
    type IOIMEntityWriter,
    type TOIMEntitySlot,
    type TOIMSlotEditable,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; title: string; rank: number };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const cardContentService = cardService.slotContentService;
```

A write puts a value into an entity's slot, works out which columns moved, and
tells exactly the readers of those columns and of that slot. This page covers the
doors of the entity content service (`cardService.slotContentService`) that do this on a collection
and on a standalone record, the two writers that do the column work underneath, and the one rule
every write obeys: it is refused while a flush is running.

<InShort>

- A write puts a value into an entity's slot and works out which columns moved.
- It tells exactly the readers of those columns and of that slot.
- The column work is done by a writer, chosen between the in-place and the replacing writer.
- Every write is refused while a flush is running.

</InShort>

## Every write reaches a channel

Every store slot is created with a channel slot (`createStoreSlot(db)` takes `db.defaultChannelSlot`), so
there is no flag to check. Every write reports the entity slot, and each watched column that moved, to the
channel slot of the store slot it lands in. The options and their defaults are listed in
[Collections and identities](/docs/core/collections#building-one); the channel is described in
[Every collection has a channel](/docs/core/model#every-collection-has-a-channel). A standalone record is
a store slot too, so it always reports.

## The writes

Every write door is on the content service. A door that works on a whole collection takes its store
slot first; a door that works on one slot you hold takes only the slot, because the slot carries the
store slot it is filed in. There are no by-key write doors: a key that arrives from outside is resolved
with `cardService.getSlotByKey(cards, key)` (or `findSlotByKey`, which mints nothing) and written through.

| Call | What it does |
|---|---|
| `upsertEntity(storeSlot, entity, changed?)` | Write a whole value under `keyOf(entity)`. A key with no value gets one and every column counts as new; a key that has one is brought to the value given — columns that moved are written, columns the new value does not carry are taken away. The slot always comes back, whatever the write changed. |
| `insertEntity(storeSlot, key, entity, changed?)` | The same under a key you name. `upsertEntity` is `insertEntity(storeSlot, keyOf(entity), …)`. |
| `upsertEntities(storeSlot, entities, changed?)` | The loop. Returns the slot of every entity, in input order, whether or not its write changed anything — so `bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, cardContentService.upsertEntities(cards, payload))` files every entity. |
| `insertEntities(storeSlot, entities)` | A bulk load of new keys. No `changed`: a bulk load changes every entity. |
| `fillEntities(storeSlot, keys, entities)` | The same under keys you name, into an empty collection only. |
| `updateEntity(slot, patch)` | Patch through an identity you hold. The columns named move, the ones not named stay. Returns the slot. |
| `updateEntityColumn(slot, columnName, value)` | One column through an identity you hold, with no patch object to build and walk. Returns the slot. |
| `writeEntity(slot, entity)` | A whole value onto a slot you hold (PUT). Answers whether the content landed. |
| `deleteEntity(slot)` | The value leaves; the identity stays for as long as anything still refers to it. |
| `deleteEntities(storeSlot, slots)` | The batch form. |
| `clearAllEntities(storeSlot)` | Every value out. Identities something still holds survive without one. |
| `deleteEntityColumns(slot, names)` | Take named columns away from an identity you hold. Returns the slot. |
| `markEntityChanged(slot, changedColumns?)` | Report a change you made to `slot.entity` yourself. |
| `findEntityByKey(storeSlot, key)` | Not a write: the entity or `undefined`, minting nothing. |

`deleteEntityColumns` is a slot door, so it takes a column away from a slot of a collection
as it does from a [standalone record](#writing-a-standalone-record). A column also leaves
an entity through a PUT — `upsertEntity` of a value that does not carry it.

### Which door to take

```ts
declare const keyFromTheServer: string;

const held = cardContentService.upsertEntity(cards, { id: 'c2', title: 'Two', rank: 2 });
cardContentService.updateEntity(held, { rank: 3 });
const fromTheServer = cardService.findSlotByKey(cards, keyFromTheServer);
if (fromTheServer !== undefined) cardContentService.updateEntity(fromTheServer, { rank: 4 });
cardContentService.deleteEntity(held);
```

A one-column write (`updateEntityColumn`) of the value the column already holds stores nothing and
wakes nobody: the writer's `patchColumn` compares and reports no change. It still passes through the
door's checks first, so during a flush it is refused like any other write.

There is no `updateEntityByKey`: resolve a key once when it arrives from outside, and keep the slot.
The write that returned the slot already paid for the lookup.

The batch forms (`upsertEntities`, `insertEntities`, `fillEntities`, `deleteEntities`,
`clearAllEntities`) are for many entities at once. No frame can close in the middle of a batch, and an
index over the collection is told once, with every slot of the batch. An index is current as soon as
the door returns.

### What a write wakes

A write tells the channel about the entity slot and about each column slot filed on it whose column
moved. A column slot is filed while something holds it or subscribes to it, and from the getter that
minted it until the unused-slot collector sweeps it. Nobody else is written to.

| Write | Slot woken | Column slots woken |
|---|---|---|
| a value onto a slot that has none (`fillEntity`) | yes | each filed column the new value carries with a value other than `undefined` |
| a whole value onto a slot that has one (`putEntity`) | if any column moved | the columns that changed and the columns that left |
| a patch (`patchEntity`) | if any column moved | the columns that changed |
| one column (`patchColumn`, from `updateEntityColumn`) | if the column moved | that column, if it moved |
| a removal (`clearEntity`) | yes, if there was a value | each filed column the old value carried with a value other than `undefined` |
| `markEntityChanged(slot, names)` | yes, unless `names` is `[]` | the named columns |
| `markEntityChanged(slot)` | yes | every filed column |

Every write that changed the value also hands the slot to the content-change listeners
of the store slot it is filed in, which is how an index re-files the entity — see
[Indexes](/docs/core/oimindex).

```ts
const slot = cardContentService.upsertEntity(cards, { id: 'c3', title: 'Three', rank: 3 });
let rankRuns = 0;
const rankColumn = cardService.holdColumn(slot, 'rank');
const rankEffect = effectService.createEffect(db, [rankColumn], [], () => { rankRuns++; });
db.flush();
rankRuns = 0;

cardContentService.updateEntity(slot, { title: 'Tres' });
db.flush();   // rankRuns === 0
cardContentService.updateEntity(slot, { rank: 4 });
db.flush();   // rankRuns === 1

effectService.disposeEffect(rankEffect);
cardService.unholdColumn(rankColumn);
```

Delivery is per column because the writer already knows which columns moved (it
had to compare them to decide whether to write), so routing that list costs a
lookup per moved column, and a reader of one column pays nothing for the others.

### Which entities actually changed

```ts
declare const payload: readonly Card[];
declare function reindex(slot: TOIMEntitySlot<Card, TOIMStoreKey>): void;

const changed: TOIMEntitySlot<Card, TOIMStoreKey>[] = [];
cardContentService.upsertEntities(cards, payload, changed);
for (const slot of changed) reindex(slot);   // the re-sent entities are not in here
changed.length = 0;
```

The array is optional, yours, and appended to; the engine never reads it and
never clears it. A slot is pushed exactly when the write put in content different
from what that entity already held, so one array reused across a whole batch
comes out as the list of entities a re-indexing pass owes anything, rather than
the list of entities that arrived. `insertEntity(cards, key, entity, changed)`
takes the same parameter.

The slot doors `cardContentService.writeEntity(slot, entity)` and
`bucketService.slotContentService.writeBucketMemberSlots(bucket, members)` return a boolean: whether
the content changed. `false` does not mean the slot may go; that is decided by emptiness and the
release policy.

An `upsertEntity` onto a slot that holds an entity your `slotEmptiness` calls empty (a soft delete)
is still a PUT onto that entity, not a fresh fill: only the columns that moved wake.

### The bulk loads check their precondition rather than declaring it

```ts
const freshCards = cardService.createStoreSlot(db);
cardContentService.insertEntities(freshCards, [
    { id: 'c1', title: 'Ace', rank: 1 },
    { id: 'c2', title: 'Two', rank: 2 },
]);
```

`insertEntities` is a bulk load with the keys taken from `keyOf`; `fillEntities(storeSlot, keys, entities)`
takes them from you, in step with the entities. What they buy over `upsertEntities` is one
content subframe for the whole load and a load that is all or nothing as far as keys go. They do not
save a store lookup: each key is still looked up once, to catch a key that is taken or named twice, and
set once.

Trusting, per entity, that "these keys are new" would strand subscribers. A key that did have an
identity silently gets a second one, and every effect on the first is left on a slot nothing writes to
again. So on a key that is taken or named twice, both throw and roll back only the entities that call
filed; what was in the collection before stays:

```
OIMSlotContentEntityService.fillEntities: the pairs name one key more than once. …
The collection is left as fillEntities found it.
```

`fillEntities` additionally requires an empty collection, which is checked once, in constant time, and
throws on lists of different lengths.

They do not save the two allocations an entity costs: the slot and, under a copying strategy, the copy.

### The store keeps the object you insert

Under the default `oimInsertEntityWithoutCopy`, the store keeps the object you hand
in, and that object is what is stored and handed to readers. From then on, change it
only through the content service: `updateEntity`, or `markEntityChanged` after you edit it
by hand. If you edit it and call `upsertEntity` with the same object again, nobody is
told: the store already holds those values, so no column reads as changed. It is the
same mistake as editing a stored entity without `markEntityChanged`. With the in-place writer a
later update edits that same object; with the replacing writer it leaves your object
alone and stores a new one. `oimInsertEntityWithCopy` stores `{ ...entity }` instead, so
mutating the object you passed afterwards does nothing. `oimInsertEntityWithSanitizedCopy`
stores a copy with an own `__proto__` key removed: pick it when you insert untrusted JSON
(for example `JSON.parse` of data from other users). You pass any one to a writer factory
as `entityInsertStrategy`, and it decides only the first value a slot gets (`fillEntity`):

```ts
const copyingCardService = createOIMEntityService<Card>(db, {
    keyOf: (card) => card.id,
    entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
});
const copiedCards = copyingCardService.createStoreSlot(db);

const mine = { id: 'c9', title: 'Nine', rank: 9 };
copyingCardService.slotContentService.upsertEntity(copiedCards, mine).entity === mine;   // false
```

Pass `entityInsertStrategy: oimInsertEntityWithCopy` whenever the caller must keep its
object untouched, or anything else may still hold it. The default suits an object
already yours to give away (freshly parsed, never shared), where a copy is pure cost.

A value that somebody else can edit behind the engine's back moves stored state
with no `sameValueGuard`, no frame and no wake-up, and every reader afterwards
sees the new value without being told. That is why the copy exists as a strategy.

The stored entity is reachable as `slot.entity`. You may edit it, as long as you then
report what you did. That is the next section.

### `markEntityChanged`: the write where you already know what moved

```ts signature
cardContentService.markEntityChanged(
    slot: TOIMEntitySlot<TEntity, TKey>,
    changedColumns?: readonly (keyof TEntity & string)[],
): void
```

Every other write derives the verdict: the writer walks the value that
arrived (`oimPatchEntityColumns`, `oimPutEntityColumns`) and puts each column through `sameValueGuard`. A caller who edited the stored
object by hand already holds that verdict, so this door accepts it instead of
recomputing it: no patch object to build, no copy, no comparison per column.

```ts
const slot = cardService.getSlotByKey(cards, 'c1');
slot.entity!.title = 'two';
cardContentService.markEntityChanged(slot, ['title']);
```

Nothing above the last line wakes anyone. A hand mutation on its own is invisible
to every effect, every column subscriber and every derivation. `markEntityChanged` is
the only thing that tells the runtime it happened.

No cast is needed. `TOIMEntitySlot` declares
`readonly entity: TEntity | undefined`. `readonly` forbids *replacing* the
object, not writing its columns, so `entity.title = 'two'` type-checks. You
still have to narrow the `| undefined`. The type that removes `readonly` from
the field itself is `TOIMSlotEditable<TSlot>`, and assigning
`slot.entity` is what needs it.

Pass the list. With a list, only those columns
wake and the others are untouched. With no list, the column owner
walks the slot's whole column store: every column slot filed on it, which means
the columns something holds or subscribes to, because a column slot is removed as soon as
neither is true. So the convenient overload brings back the per-column walk this door exists
to avoid.

An empty list wakes nothing at all, neither the columns nor the slot. `[]` is the caller saying nothing moved, so
`markEntityChanged` returns before it opens the subframe. The flush check runs
before that return, so even `[]` is refused during a flush.

Both of the reporting forms write the entity slot too, so an effect on the slot
sees a hand mutation, not only an effect on a column.

Indexes are told and emptiness is settled again, so a hand mutation that empties the
entity is seen by the release policy.

It is refused during a flush, like every other write, and it throws on a released
identity.

A misspelt column name, a bare runtime `string`, and a slot of some other entity
type are each a compile error, because the parameter is
`readonly (keyof TEntity & string)[]`, not `readonly string[]`.

### A removal leaves a bucket's slots standing

A slot does not know which buckets it is in, and nothing can enumerate them, so
a removal cannot take it out of them. What a bucket holds is a fact about the
response a caller is composing, and the caller who put a slot in a bucket takes it out,
with the bucket content service's `clearBucketMemberSlots`, `writeBucketMemberSlots`, or a positional removal.

What that leaves behind is a bucket holding a slot with no value, just like
a bucket that was resolved before its slots arrived. The cost is that the bucket's hold on the slot (`holdCount`) keeps the identity alive until you
empty the bucket. That is the same thing as saying "a slot in a bucket is a
reference".

`slot.data` belongs to the consumer: the core never reads or writes it, and clearing or
removing the slot (`deleteEntity(slot)`) does not reset it. The identity survives a
removal, so whatever you wrote there is handed to the first reader after a
re-`upsertEntity` unless you clear it yourself. `slot.indexKeys` belongs to the indexes; do not
write it.

### A write that changes nothing wakes nobody

When no column moved, nothing is written to the channel and no index is told:
`writeEntity` returns `false`, `updateEntity` returns the slot, and nobody wakes.
`markEntityChanged(slot, [])` is the same from the other side.

## The two writers

Both halves of a write, putting columns in and taking them out, come as one
object, so they cannot disagree.

```ts signature
interface IOIMEntityWriter {
    readonly fillEntity: (slot: TOIMEntitySlot, entity: object) => void;
    readonly putEntity: (slot: TOIMEntitySlot, entity: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchEntity: (slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchColumn: (
        slot: TOIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ) => boolean;
    readonly deleteColumns: (slot: TOIMEntitySlot, names: readonly string[]) => readonly string[];
    readonly clearEntity: (slot: TOIMEntitySlot) => void;
}

createOIMEntityWriterInPlace(options?)   // the stored object keeps its identity
createOIMEntityWriterReplacing(options?) // every write that changed something produces a new object
// TOIMEntityWriterOptions = { sameValueGuard?; entityInsertStrategy?; putEntityColumns?; patchEntityColumns?; patchEntityColumn? }
```

A writer moves columns and nothing else: it reaches no channel, takes no holds,
and knows nothing about lifetime. `deleteColumns` hands back the names that
actually moved. `putEntity` and `patchEntity` answer whether anything moved and push
the moved names into the array they are handed, when they are handed one.

`putEntity` is PUT and `patchEntity` is PATCH, as in HTTP. In one call, PUT makes the stored
entity the value you hand in: the columns that changed are written and the
columns the value does not have leave. PATCH writes only the columns the
patch names. `upsertEntity` of a key that already has a value and
`writeEntity` are PUT, so a whole-value write that drops a column
wakes the slot's readers through one channel write per slot, and the replacing
writer builds one new object. `clearEntity` sets `slot.entity` to `undefined`
under both writers.

The writer is chosen once, at construction: the `entityWriter` option of the entity content service,
or of `OIMDB` for every collection of that db. Every store slot of one collection type shares it:

```ts
const replacingDb = new OIMDB({ entityWriter: createOIMEntityWriterReplacing() });
const deckService = createOIMEntityService<Card>(replacingDb, { keyOf: (card) => card.id });
const decks = deckService.createStoreSlot(replacingDb);

const aceSlot = deckService.slotContentService.upsertEntity(decks, { id: 'c1', title: 'Ace', rank: 1 });
const before = aceSlot.entity;
deckService.slotContentService.updateEntity(aceSlot, { rank: 2 });
aceSlot.entity !== before;   // true

const oneReplacingCardService = createOIMEntityService<Card>(db, {
    keyOf: (card) => card.id,
    entityWriter: createOIMEntityWriterReplacing(),
});
```

Left out everywhere, the writer is `OIMDefaults.ENTITY_WRITER.getValue()`, which is
`createOIMEntityWriterInPlace()` unless replaced at startup. Replacing it after
anything has read it throws (`OIMDefaults.ENTITY_WRITER has already been handed
out`), because every object built before would keep the old one.

### Writing your own writer

```ts signature
oimPatchEntityColumns(slot, patch: object, sameValueGuard, changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> | undefined
oimPatchEntityColumn(slot, columnName: string, value: unknown, sameValueGuard, changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> | undefined
oimPutEntityColumns(slot, entity: object, sameValueGuard, changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> | undefined
oimPutEntityColumnsGuarded(slot, entity: object, sameValueGuard, changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> | undefined
```

These are the column walks both shipped writers run; `oimPatchEntityColumn` is the
one-column form behind `patchColumn`, with no patch object to walk. Each compares every column
through `sameValueGuard`, writes the moved ones into the object `targetOf` hands
back on the first move (the stored entity itself when in place, a copy when
replacing), pushes their names into `changedColumnNames` when it is an array,
and returns that object; `undefined` means nothing moved or the slot holds no
entity. The put walk also writes `undefined` over every column the new value
lacks. Each walk is itself a strategy, an option of the writer factories (`TOIMEntityWriterOptions`),
with two arms:

| Option | Default | Guarded arm |
|---|---|---|
| `putEntityColumns` | `oimPutEntityColumns` — skips neither `__proto__` keys nor inherited stored columns | `oimPutEntityColumnsGuarded` — skips both |
| `patchEntityColumns` | `oimPatchEntityColumns` — every enumerable key of the patch | `oimPatchEntityColumnsGuarded` — skips a `__proto__` key and a key the patch does not own |
| `patchEntityColumn` | `oimPatchEntityColumn` | `oimPatchEntityColumnGuarded` — refuses the column name `__proto__` |

Take the guarded arms, at a cost on every write, for values that can carry a `__proto__` key or are class
instances, on `createOIMEntityWriterInPlace` or `createOIMEntityWriterReplacing`.
A writer of your own reuses the walks and decides only where the result goes.
This one stores every value frozen:

```ts
const copyColumns = (entity: Record<string, unknown>): Record<string, unknown> => ({ ...entity });

function storeFrozen(slot: TOIMEntitySlot, next: Record<string, unknown> | undefined): boolean {
    if (next === undefined) return false;
    (slot as TOIMSlotEditable<TOIMEntitySlot>).entity = Object.freeze(next);
    return true;
}

const replacingWriter = createOIMEntityWriterReplacing();

const freezingWriter: IOIMEntityWriter = {
    fillEntity: (slot, entity) => { storeFrozen(slot, copyColumns(entity as Record<string, unknown>)); },
    clearEntity: replacingWriter.clearEntity,
    putEntity: (slot, entity, changedColumnNames) =>
        storeFrozen(slot, oimPutEntityColumns(slot, entity, oimSameValueZeroGuard, changedColumnNames, copyColumns)),
    patchEntity: (slot, patch, changedColumnNames) =>
        storeFrozen(slot, oimPatchEntityColumns(slot, patch, oimSameValueZeroGuard, changedColumnNames, copyColumns)),
    patchColumn: (slot, columnName, value, changedColumnNames) =>
        storeFrozen(slot, oimPatchEntityColumn(slot, columnName, value, oimSameValueZeroGuard, changedColumnNames, copyColumns)),
    deleteColumns: (slot, names) => {
        const deleted = replacingWriter.deleteColumns(slot, names);
        if (deleted.length !== 0) storeFrozen(slot, slot.entity as Record<string, unknown>);
        return deleted;
    },
};

const frozenCardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id, entityWriter: freezingWriter });
const frozenCards = frozenCardService.createStoreSlot(db);
```

### Which strategy to pick

`createOIMEntityWriterInPlace` keeps the stored object's reference stable across writes.
Readers must be subscription-driven: `slot.entity` before and after an update is
`===`, so a binding that decides "did it change?" by comparing values will never
fire. Your effect running is what tells you something happened.

Neither writer `delete`s a column. A column taken away — dropped by a PUT, or
named in `deleteEntityColumns` — is written `undefined`, which keeps every entity of a
kind on one V8 shape. The key stays in `Object.keys` and `in`, the
column reads `undefined`, and a column holding `undefined` counts as absent: a PUT
does not count it as leaving and a removal does not count it as removed, so neither
wakes anyone for it.

`createOIMEntityWriterReplacing` produces a new object per changed write, so a consumer that compares
by reference (a memoised render, a shallow-equality selector, a library that
diffs props) sees the change without being told. The new object is a spread copy
(`oimCopyEntity`), and a column it takes away is
`undefined` on it, as above. A write that changed nothing keeps the old object.

### `sameValueGuard`

Both writers take it as `sameValueGuard` in their options, defaulting to `oimSameValueZeroGuard`
— `===` except that `NaN` equals itself. Pass your own when a column's "did it
move" is not identity:

```ts
createOIMEntityWriterInPlace({ sameValueGuard: (prev, next) => JSON.stringify(prev) === JSON.stringify(next) });
```

It decides *only* whether a column counts as moved, and therefore whether anyone
is woken for it. It is called once per column the incoming value carries, on every
PUT and PATCH, so its cost is paid per column per write.

## Writing a standalone record

```ts
type Settings = { theme: string; fontSize: number; sidebar?: boolean };

const settingsService = createOIMSingleEntityService<Settings>(db, {
    entityWriter: createOIMEntityWriterInPlace(),
});
const settings = settingsService.createStoreSlot(db);
const settingsContentService = settingsService.slotContentService;
settingsContentService.upsertEntity(settings, { theme: 'dark', fontSize: 14, sidebar: true });
const settingsSlot = settingsService.getSingleSlot(settings);

settingsContentService.updateEntity(settingsSlot, { theme: 'light' });
settingsContentService.deleteEntityColumns(settingsSlot, ['sidebar']);                // the thing a patch cannot say
settingsContentService.writeEntity(settingsSlot, { theme: 'dark', fontSize: 16 });   // columns it had and this does not, go
```

A standalone record is a store slot of a single entity service, an `OIMSingleSlotService` over an entity
content service keyed by `void` over `OIMSlotStoreServiceSingleSlotDriven.INSTANCE`. `createStoreSlot(db)` mints
nothing; the first value arrives through `upsertEntity(storeSlot, entity)`, an ordinary write that wakes its
readers like any other, and the slot is read through `getSingleSlot(storeSlot)`. `updateEntity` is PATCH,
`writeEntity` is PUT, `deleteEntityColumns` is the writer's `deleteColumns`; `updateEntity` and
`deleteEntityColumns` return the slot, and `writeEntity` answers whether the content landed.
`entityWriter`, `slotEmptiness`, `slotReleasePolicy`, `columnSlotStoreService` and `columnNames` are
optional and come from the db and the defaults when left out; `columnNames` names the columns and files
their slots in the ordinal store. The record owns one slot, with no key, filed in its store slot under
its release policy: what it wakes is that slot and the column slots filed on it that moved, and nothing
when no column moved.

Use `writeEntity` to restore a saved state. A patch alone leaves behind
every key that was deleted before the snapshot was taken, so a plain load quietly
resurrects them.

A misspelt column in `deleteEntityColumns` is a compile error naming the column, because
its parameter is `readonly TOIMEntityColumnName<TEntity>[]`.

See [Standalone records](/docs/core/object) for the rest of its surface.

## Writes and the frame

A write during a flush throws. That covers the effect bodies, `onBeforeFlush` and the
after-each-frame handlers (`subscribeAfterEachFrame`, `subscribeOnceAfterFrame`): subscribers
are told after the delivery list was taken, so a write from there would land in a frame
that is no longer collecting. To write in response to a change, hand the work to a
microtask or a later callback, or use `OIMChannelService.INSTANCE.subscribeAfterEachFlush`,
whose handlers run after the flush and may write. See
[The channel](/docs/core/channel#the-rules).

To group several writes so no frame closes between them, bracket them with
`OIMChannelService.INSTANCE.openSubframe(channelSlot)` and `closeSubframe(channelSlot)`.
`flush()` throws while a subframe is open, and that includes a `flush()` called from your
own code running inside a write: an index's `keyOf`, `slotEmptiness.isEmpty`, a writer.

## Where to next

<DocCards>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">What a write wakes.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">The writes that set a bucket's slots.</DocCard>
<DocCard to="/docs/core/object" title="Standalone records">One keyless record with its own writers.</DocCard>
<DocCard to="/docs/guides/error-handling" title="Error handling">What a refused or throwing write leaves behind.</DocCard>
</DocCards>
