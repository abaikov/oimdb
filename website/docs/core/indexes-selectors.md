---
sidebar_position: 2
---

# Indexes and Selectors

Indexes are collection-bound structures created via `indexFactory`. They live next to the collection but are not stored inside it.

Selectors deliver reactive values to a callback. They coalesce multiple invalidations within a flush into a single delivery.

## Which kind to use

Two kinds, by **who decides membership**:

- **Manual indexes** — *you* set membership and order with `setPks` / `addPks` / `removePks`. This is the common case: server-provided ordering, search results, sorted lists, drag-and-drop, filters, selection — anything where the order/membership isn't simply a field on the entity. Start here.
- **Derived indexes** — membership is computed from an entity field via a selector and stays in sync automatically. Use only when "which group an entity belongs to" *is* a pure function of its data (e.g. `card.deckId`).

Both come in **set-based** (unordered) and **array-based** (ordered) flavours. See [Manual indexes](#manual-indexes) first; [Derived indexes](#derived-indexes) below.

## Manual indexes

You own membership and order. Writes are incremental (only the changed pks are touched).

```typescript
// Set-based — unordered membership (roles, tags, selection, flags)
const adminUsers = users.indexFactory.setBasedIndex<string>();
adminUsers.setPks('active', ['u1', 'u2']);  // replace the whole key
adminUsers.addPks('active', ['u3']);         // add (O(1) per pk, dedups)
adminUsers.removePks('active', ['u1']);      // remove (O(1) per pk)

// Array-based — ordered membership (search results, ranked / sorted lists)
const ranked = users.indexFactory.arrayBasedIndex<string>();
ranked.setPks('byScore', ['u3', 'u1', 'u2']); // order is exactly what you pass
```

### Writing by pk vs by slot

The `*Pks` methods resolve each pk to its entity slot (one O(1) lookup per pk) — use them when you have **ids** (scroll position, URL, server response). That covers virtually every UI case.

If you already hold the **slots** — `collection.upsertMany()` returns them — skip the re-lookup with the lower-level `setSlots` / `appendSlots`:

```typescript
const slots = users.collection.upsertMany(batch); // slots already resolved
ranked.setSlots('byScore', slots);                // no per-pk lookup
```

Reads are slot-native too: `getSlotsByKey(key)` returns the slots directly, and `getEntitiesByKey(key)` reads `slot.item` with no secondary lookup.

### Order & sorting

An **array-based** index keeps **the order you give it** — there is no automatic field sort (that's a derived index's `orderBy`). You own the order:

```typescript
// keep a list sorted by a field: sort the pks yourself, then setPks
function syncSorted() {
  const sorted = users.collection
    .getAll()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(u => u.id);
  ranked.setPks('byName', sorted);
}
syncSorted();                  // re-run when the data or sort key changes
```

- `addPks` **appends** to the end (it does not re-sort) — fine for "newest last" / insertion order; re-`setPks` with sorted pks when you need a specific order.
- For **incremental** ordered edits (insert at position, move) without rebuilding the array, use the [ordered list command stream](#ordered-list-command-stream).
- A **set-based** index has no order; iterate its pks/entities in whatever order you render.

### Choosing set vs array

| | `addPks` | `removePks` | order |
|---|---|---|---|
| **set-based** | O(added) | O(removed) | unordered |
| **array-based** | O(added) | O(bucket) | preserved |

Frequently changing membership is a **common, hot** case, not a rare one — e.g. a **virtual/windowed list** keeps an index of just the on-screen pks and adds/removes rows on every scroll. For these, prefer a **set-based** index: `addPks`/`removePks` are O(1) per pk, so per-scroll churn stays cheap.

```typescript
// virtual list: index holds the currently visible rows
const visible = rows.indexFactory.setBasedIndex<string>();

function onScroll(firstVisible: number, lastVisible: number) {
  // add rows that entered the viewport, remove the ones that left — O(changed)
  visible.addPks('viewport', enteredPks);
  visible.removePks('viewport', leftPks);
}
```

Use **array-based** when you need order; its removal is O(bucket) because an ordered array must be scanned (batch `removePks` when you can). For an *ordered* virtual list with incremental moves, the [ordered list command stream](#ordered-list-command-stream) emits insert/remove/move commands you can apply directly to the DOM.

## Derived indexes

Membership is computed automatically from entity fields.

```typescript
// Set-based — order doesn't matter
const usersByTeam = users.indexFactory.derivedSetIndex(
  (user) => user.teamId     // return one key or an array of keys
);

// Array-based — preserves order
const cardsByDeck = cards.indexFactory.derivedArrayIndex(
  (card) => card.deckId,
  { orderBy: (card) => card.position }  // or compareEntities for custom sort
);

cards.collection.upsertMany([
  { id: 'c1', deckId: 'deck1', title: 'Second', position: 2 },
  { id: 'c2', deckId: 'deck1', title: 'First',  position: 1 },
]);

cardsByDeck.getPksByKey('deck1'); // ['c2', 'c1']
```

`selectIndexKeys` can return a single key or an array — useful for multi-category membership:

```typescript
// entity appears under every tag it belongs to
const postsByTag = posts.indexFactory.derivedSetIndex(
  (post) => post.tags  // string[]
);
```

### Index reads

Both types expose the same read API:

```typescript
index.getPksByKey('key');          // Set<TPk> or TPk[]
index.getEntitiesByKey('key');     // (TEntity | undefined)[] — aligned with the pks,
                                   // a not-yet-loaded entity is a positional `undefined`
                                   // hole (not dropped), so you can render a loading state
index.hasKey('key');               // boolean
index.getKeys();                   // all known keys
```

## Global (keyless) indexes

Sometimes you want **one** index or ordered list over the *whole* collection —
"all users, sorted by name", "every visible row". There is no meaningful key, so
reach for a **Global** index instead of inventing a phantom `'all'` key. Global
indexes come in the same shapes (set / array) and modes (manual / derived), but
keyless: reads take no key and you `subscribe(handler)` instead of
`subscribeOnKey(key, handler)`. Internally each holds a single bucket with a
single-carrier emitter, so it is lighter than a keyed index carrying one key.

```typescript
// Manual, collection-bound (write pks directly)
const list = users.indexFactory.arrayBasedGlobalIndex();
list.setPks(['u2', 'u1']);      // also addPks / removePks — no key
list.getPks();                  // ['u2', 'u1']
list.subscribe(() => { /* the one bucket changed */ });

// Derived — auto-tracks the whole collection, ordered
const recent = users.indexFactory.derivedArrayGlobalIndex({
  orderBy: (user) => user.createdAt,   // or compareEntities
  filter: (user) => !user.archived,    // optional; default: entity exists
});
recent.getEntities();           // (User | undefined)[] in order, kept in sync

// Derived set — whole-collection membership
const everyone = users.indexFactory.derivedSetGlobalIndex();
```

Reads mirror the keyed API without the key: `getPks()`, `getSlots()`,
`getEntities()`, `size`, `isEmpty`. Selectors: `select.entitiesByArrayGlobalIndex(list)`
and `select.entitiesBySetGlobalIndex(set)`.

## Composite (key-path) indexes

Sometimes the key is a **combination** of values — "members of *this project* with
*this role*", keyed by `[projectId, role]` — not a single primitive. The wrong fix
is to concatenate a string key like `` `${projectId}|${role}` ``: separators
collide (`['a|b','c']` vs `['a','b|c']`), `1` and `'1'` merge, and you rebuild a
string on every read. Reach for a **composite** set-based index instead.

Create it with `indexFactory.compositeSetIndex()`. The key is a `TOIMKeyPath` — an
ordered, **arbitrary-length** tuple of primitive segments (`readonly (string |
number)[]`). Every method that took a `key` now takes a path array; everything else
is identical to `setBasedIndex`.

```typescript
const membersByScope = members.indexFactory.compositeSetIndex();

membersByScope.setPks(['p1', 'admin'], ['m1', 'm2']);  // also addPks / removePks
membersByScope.getPksByKey(['p1', 'admin']);           // Set { 'm1', 'm2' }
membersByScope.getEntitiesByKey(['p1', 'admin']);      // (Member | undefined)[]
membersByScope.subscribeOnKey(['p1', 'admin'], () => { /* this scope changed */ });
```

Key paths are **matched by content**, so a freshly built `['p1', 'admin']` resolves
to the same bucket as the one written earlier — you never need to hold on to the
array instance. Each segment keeps its own type, no separator can collide, and
lookup is O(arity) (effectively O(1) for a fixed arity): internally it walks one
native-`Map` level per segment (a trie). The full path is the lookup unit — there
are no partial/prefix queries — and paths of different lengths coexist without
collision (`['a', 'b']` and `['a', 'b', 'c']`).

This is a distinct, opt-in index: `setBasedIndex` and every other index keep their
native-`Map` fast path untouched, so composite keys add **no cost** to primitive
ones. Advanced: inject a custom key-path store via `indexOptions.store` (an
`OIMIndexStoreSetBased<TOIMKeyPath, TPk>`); the default is
`OIMIndexStoreTrieDrivenSetBased`.

For an **ordered** bucket per composite key, use `compositeArrayIndex()` — the
array counterpart, where `getPksByKey(path)` returns an array in write order.

Read a composite index through selectors and React hooks just like a primitive
one, passing a path where a key went:

```typescript
// Selectors (also entitiesByCompositeArrayIndexKey for the ordered variant)
const scope = members.select.entitiesByCompositeSetIndexKey(index, ['p1', 'admin']);
scope.getValue();  // (Member | undefined)[]

// React — stabilizes the path by content, so a fresh array each render is fine
const rows = useSelectEntitiesByCompositeIndexKeySetBased(members, index, ['p1', 'admin']);
const pks  = useSelectPksByCompositeIndexKeyArrayBased(orderedIndex, ['c1', 't1']);
```

## Ordered list command stream

`indexFactory.orderedList()` creates an `OIMCollectionOrderedListCommandStream`. Unlike `arrayBasedIndex`, it also produces incremental, **position-addressed** commands that consumers can replay without diffing.

```typescript
const queue = users.indexFactory.orderedList<string>();

queue.push('main', 'u1');          // append
queue.push('main', 'u2');
queue.insertAt('main', 0, 'u3');   // insert at position
queue.setAt('main', 1, 'u4');      // replace the element at index 1
queue.removeRange('main', 0, 2);   // remove 2 consecutive → remove{count:2}
queue.moveRange('main', 0, 3, 2);  // move a block of 2 → move{count:2}
queue.set('main', ['u3', 'u1', 'u2']); // replace entire list
```

`removeRange`/`moveRange` emit `remove`/`move` commands with `count > 1`; the single-element `removeAt`/`move` omit `count` (consumers read `count ?? 1`).

Commands are addressed by **position**, and each command's `item` is the entity **slot** (read the entity via `item.item`):

```typescript
type Command<Slot> =
  | { type: 'insert'; index: number; item: Slot }
  | { type: 'remove'; index: number; count?: number }   // count may be > 1
  | { type: 'move';   from: number; to: number; count?: number }
  | { type: 'set';    index: number; item: Slot }        // replace one element
  | { type: 'reset';  items: readonly Slot[] };          // replace whole list
```

Subscribe to command delivery via `commandsEventEmitter`, then read buffered commands inside the callback. The buffer clears automatically after each flush.

```typescript
const off = queue.commandsEventEmitter.subscribeOnKey('main', () => {
  const commands = queue.getBufferedCommands('main');

  for (const cmd of commands) {
    if (cmd.type === 'insert') console.log('insert', cmd.item.item, 'at', cmd.index);
    if (cmd.type === 'remove') console.log('remove', cmd.count ?? 1, 'from', cmd.index);
    if (cmd.type === 'move')   console.log('move',   cmd.from, '->', cmd.to);
    if (cmd.type === 'set')    console.log('set', cmd.index, cmd.item.item);
    if (cmd.type === 'reset')  console.log('reset', cmd.items.length, 'items');
  }
});

// Read current state without commands
queue.getPksByKey('main');       // TPk[]
queue.getEntitiesByKey('main');  // (TEntity | undefined)[] — holes preserved
```

If multiple operations happen in one flush, they are buffered in order. If a `reset` (whole-list replace) is mixed with incremental ops, the stream collapses everything into one `reset` command.

### Mapping the list to your own elements

When you drive an imperative renderer — moving real DOM nodes, canvas objects, view models — you want the commands to carry **your** element, not the slot. `createOIMOrderedListMappedCommandStream(source, create)` projects the stream element-wise: same position-addressed commands, with `item` replaced by whatever `create` returns. `create` is a plain function — no options object.

```typescript
const nodes = createOIMOrderedListMappedCommandStream(
  stream,
  (slot) => engine.makeNode(slot.item)   // runs once per element
);

nodes.subscribeCommands('main', () => {
  for (const cmd of nodes.consumeCommands('main')) {
    if (cmd.type === 'insert') engine.insertAt(cmd.index, cmd.item); // cmd.item is your node
    if (cmd.type === 'move')   engine.move(cmd.from, cmd.to);
    if (cmd.type === 'remove') engine.removeAt(cmd.index, cmd.count ?? 1); // tear the node down here
    // ...
  }
});

nodes.getItemsByKey('main'); // current mapped elements — your initial render
```

Identity is positional: a `move` reorders the **same** mapped instance — it is never recreated, so the moved node keeps its state. `create` runs on `insert` / `set` / `reset` / the initial build.

There is **no** teardown callback by design. The element that leaves is already the `remove` / `set` / `reset` command you apply against your own mirror, so any DOM/resource cleanup belongs in that handler — a `destroy` hook would just duplicate a signal you already receive.

The mapped stream rides the source's batching — no queue of its own. It is itself a source (`IOIMOrderedListCommandSource`), so it consumes exactly like the raw stream and maps chain: `nodes.map(create)`.

> Content updates (an entity's fields changed) are **not** list commands — they arrive through the collection's per-pk subscription. The stream only carries structure (insert / move / remove / set / reset). Keep the two channels separate.

### Mapping a plain index to stable objects

For an ordinary set/array index (not the command stream) you often want to turn each slot into your own object — a view-model, a row — and get the **same object back for the same slot** on every read, so `React.memo` / `Object.is` diffing works and you don't rebuild. `createOIMIndexSlotMap(index, create)` is that memo:

```typescript
const usersByTeam = users.indexFactory.derivedSetIndex((u) => u.teamId);
const rows = createOIMIndexSlotMap(usersByTeam, (slot) => makeRow(slot.item));

rows.subscribeOnKey('team1', render);
function render() {
  for (const row of rows.getByKey('team1')) {
    // same row instance per slot across renders
  }
}
```

- `create(slot)` runs once per canonical slot; the object is cached by slot identity (a `WeakMap`), so it is reference-stable and reclaimed by GC when the slot is dropped.
- Same plain-function shape as the ordered mapper — no options object, no `destroy` (these are plain values; nothing to tear down). If your mapped objects hold resources, use the ordered command stream, which has an explicit removal signal.
- `subscribeOnKey` / `subscribeOnKeys` are passthroughs to the index; `getByKey(key)` returns the mapped objects (array order for array-based, unspecified for set-based).
- `.map(create)` chains another projection with the same per-slot stability at each level.

For a [global (keyless) index](#global-keyless-indexes) use `createOIMGlobalIndexSlotMap(index, create)` — the same memo without keys: `getAll()` instead of `getByKey`, `subscribe` instead of `subscribeOnKey`.

```typescript
const everyone = users.indexFactory.derivedSetGlobalIndex();
const rows = createOIMGlobalIndexSlotMap(everyone, (slot) => makeRow(slot.item));
rows.subscribe(() => { for (const row of rows.getAll()) { /* stable per slot */ } });
```

### Deriving commands from an index

The command stream above is *written* imperatively — you call `push` / `move` / `removeAt`. To instead get commands from an index whose order is maintained automatically (a `derivedArrayIndex`, or any reactive array-based index you replace with `setPks`), wrap it with `OIMOrderedListCommandStreamDiffDriven`. On every per-key change it diffs the previous order against the new one and emits the `insert` / `move` / `remove` that transforms one into the other — so a collection change moves nodes instead of rebuilding them.

```typescript
const cardsByDeck = cards.indexFactory.derivedArrayIndex(
  (card) => card.deckId,
  { orderBy: (card) => card.position }
);

const stream = createOIMOrderedListCommandStreamDiffDriven(queue, cardsByDeck);

stream.subscribeCommands('deck1', () => {
  for (const cmd of stream.consumeCommands('deck1')) {
    // insert / move / remove — apply straight to the DOM
  }
});
```

- Identity is by pk: a reordered card is a `move` of the same slot, never a recreate. Compose `createOIMOrderedListMappedCommandStream` on top to carry your own nodes.
- It rides the index's batching and delivers on `AFTER_FLUSH`, the same timing as the written stream.
- A change that leaves the order untouched (e.g. a field the sort doesn't read) emits nothing.
- `resetThreshold` (default `0` = always diff): when the fraction of shared pks drops below it, a single `reset` is emitted instead of many edits — cheaper when most of the bucket changed.
- Moves are minimal — a longest-increasing-subsequence pass keeps the items already in relative order and moves each of the rest exactly once (`move count = common − LIS`).

## Selectors

The `select` facade on `createOIMCollectionKit` covers the most common patterns:

```typescript
const user      = users.select.byPk('u1');
const teamUsers = users.select.entitiesBySetIndexKey(usersByTeam, 'team1');
const deckCards = cards.select.entitiesByArrayIndexKey(cardsByDeck, 'deck1');
```

All selectors share the same API:

```typescript
// Sync read — always up to date
const current = selector.getValue();

// Reactive — fires immediately with current value, then on each change after flush
const unwatch = selector.watch((value) => {
  render(value);
});

unwatch(); // stop watching
```

Selectors skip delivery if the value hasn't changed. Scalar selectors (e.g. `byPk`) compare with `Object.is`; array-returning selectors (`byPks`, entities-by-index-key) return a fresh array each read but compare it **element-wise (shallow)**, so an unchanged set of entities still coalesces rather than re-firing on every flush.

## Field-level change tracking

`OIMCollectionChangedFields` wraps a collection and tracks which fields changed per write. Subscribe by field to react only to relevant changes.

```typescript
import { OIMCollectionChangedFields } from '@oimdb/core';

const tracker = new OIMCollectionChangedFields(queue, users.collection, {
  selectPk: (user) => user.id,
});

// Write through the tracker instead of the collection directly
tracker.upsertOneByPk('u1', { name: 'Alice', role: 'admin' });

// changedPksEventEmitter fires per PK that changed
tracker.changedPksEventEmitter.subscribeOnKey('u1', () => {
  const fields = tracker.getChangedFieldsByPk('u1');
  console.log('changed fields:', fields); // Set {'name', 'role'}
});

// changedFieldsEventEmitter fires per field name that changed
tracker.changedFieldsEventEmitter.subscribeOnKey('role', () => {
  const pks = tracker.getChangedPksByField('role');
  console.log('PKs with changed role:', pks);
});

queue.flush(); // both emitters fire

tracker.destroy();
```

The buffer (changed fields/PKs) is cleared automatically after each flush. Read inside the subscription callback.

By default the tracker also watches for writes that **bypass** it (direct collection mutations) and infers the changed fields by diffing entity snapshots. That diff is shallow (it can't see deep in-place mutations) and it keeps a snapshot clone per PK (~2x entity memory).

**Keep it on (the default) when something other than the tracker writes to the same collection** — a realtime sync handler, persistence hydration, or another feature module — and you still want those changes reflected:

```typescript
const tracker = new OIMCollectionChangedFields(queue, users.collection, {
  selectPk: (user) => user.id,
}); // detectExternalMutations defaults to true

// A websocket handler writes straight to the collection, not through the tracker:
socket.on('user:patch', (patch) => users.collection.upsertOneByPk(patch.id, patch));

// The tracker still reports the changed fields, so the UI can highlight them:
tracker.changedPksEventEmitter.subscribeOnKey('u1', () => {
  highlight(tracker.getChangedFieldsByPk('u1')); // works even though the write bypassed the tracker
});
```

**Turn it off** only when *every* write goes through the tracker — it drops the snapshot clone and the per-PK snapshot map:

```typescript
const tracker = new OIMCollectionChangedFields(queue, users.collection, {
  selectPk: (user) => user.id,
  detectExternalMutations: false, // drop the snapshot clone + per-PK snapshot map
});

// All writes must go through the tracker (it forwards to the collection and
// records the patched fields from the patch keys — no snapshot/diff needed):
tracker.upsertOneByPk('u1', { role: 'admin' }); // returns the canonical slot
tracker.upsertOne({ id: 'u2', name: 'Ann' });   // needs selectPk
tracker.upsertMany([{ id: 'u3' }, { id: 'u4' }]);

tracker.changedPksEventEmitter.subscribeOnKey('u1', () => {
  highlight(tracker.getChangedFieldsByPk('u1')); // {'role'}
});

// ⚠️ With detection off, a direct write bypasses tracking entirely:
users.collection.upsertOneByPk('u1', { role: 'guest' }); // NOT reported
```

**Speed:** detection on costs about **1.5× the per-write time** vs off (~+0.3µs per `upsert*`, min-of-N on a tight loop) — it keeps one snapshot clone per write plus an update subscription. The clone also means per-write **allocation → GC pressure** under sustained writes, where off allocates nothing (so the gap is larger and noisier in tail latency than the steady-state number suggests). Data-layer cost: real for high-frequency writes, invisible under a React render.

## Reference

### `indexFactory` methods

| Method | Returns | Use for |
|---|---|---|
| `derivedSetIndex(fn, opts?)` | `OIMDerivedCollectionIndexSetBased` | Auto-maintained, unordered |
| `derivedArrayIndex(fn, opts?)` | `OIMDerivedCollectionIndexArrayBased` | Auto-maintained, ordered |
| `setBasedIndex(opts?)` | `OIMReactiveCollectionIndexManualSetBased` | Manual, unordered |
| `arrayBasedIndex(opts?)` | `OIMReactiveCollectionIndexManualArrayBased` | Manual, ordered |
| `compositeSetIndex(opts?)` | `OIMReactiveCollectionIndexCompositeTrieSetBased` | Manual, unordered, composite key path |
| `compositeArrayIndex(opts?)` | `OIMReactiveCollectionIndexCompositeTrieArrayBased` | Manual, ordered, composite key path |
| `derivedSetGlobalIndex(opts?)` | `OIMDerivedCollectionGlobalIndexSetBased` | Keyless whole-collection, unordered |
| `derivedArrayGlobalIndex(opts?)` | `OIMDerivedCollectionGlobalIndexArrayBased` | Keyless whole-collection, ordered |
| `setBasedGlobalIndex(opts?)` | `OIMReactiveCollectionGlobalIndexManualSetBased` | Keyless manual, unordered |
| `arrayBasedGlobalIndex(opts?)` | `OIMReactiveCollectionGlobalIndexManualArrayBased` | Keyless manual, ordered |
| `orderedList(opts?)` | `OIMCollectionOrderedListCommandStream` | Incremental commands |
| `orderedIndex()` | `OIMCollectionIndexManualOrderedArrayBased` | Slot-first ordered index |

### `select` methods

| Method | Returns |
|---|---|
| `byPk(pk)` | `OIMCollectionByPkSelector` — `TEntity \| undefined` |
| `byPks(pks)` | `OIMCollectionByPksSelector` — `(TEntity \| undefined)[]` |
| `entitiesBySetIndexKey(index, key)` | `OIMEntitiesByIndexKeySetBasedSelector` — `(TEntity \| undefined)[]` |
| `entitiesByArrayIndexKey(index, key)` | `OIMEntitiesByIndexKeyArrayBasedSelector` — `(TEntity \| undefined)[]` |
| `entitiesByCompositeSetIndexKey(index, path)` | `OIMEntitiesByIndexKeySetBasedSelector` — `(TEntity \| undefined)[]` (composite key path) |
| `entitiesByCompositeArrayIndexKey(index, path)` | `OIMEntitiesByIndexKeyArrayBasedSelector` — `(TEntity \| undefined)[]` (composite key path) |
| `entitiesBySetGlobalIndex(index)` | `OIMEntitiesByGlobalIndexSetBasedSelector` — `(TEntity \| undefined)[]` (keyless) |
| `entitiesByArrayGlobalIndex(index)` | `OIMEntitiesByGlobalIndexArrayBasedSelector` — `(TEntity \| undefined)[]` (keyless) |
