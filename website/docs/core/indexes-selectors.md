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

## Ordered list command stream

`indexFactory.orderedList()` creates an `OIMCollectionOrderedListCommandStream`. Unlike `arrayBasedIndex`, it also produces incremental commands (insert / remove / move / set) that consumers can replay without diffing.

```typescript
const queue = users.indexFactory.orderedList<string>();

queue.push('main', 'u1');          // append
queue.push('main', 'u2');
queue.insertAt('main', 0, 'u3');   // insert at position
queue.set('main', ['u3', 'u1', 'u2']); // replace entire list
```

Subscribe to command delivery via `commandsEventEmitter`, then read buffered commands inside the callback. The buffer clears automatically after each flush.

```typescript
const off = queue.commandsEventEmitter.subscribeOnKey('main', () => {
  const commands = queue.getBufferedCommands('main');

  for (const cmd of commands) {
    if (cmd.type === 'insert') console.log('insert', cmd.pk, 'at', cmd.index);
    if (cmd.type === 'remove') console.log('remove', cmd.pk, 'from', cmd.index);
    if (cmd.type === 'move')   console.log('move',   cmd.pk, cmd.fromIndex, '->', cmd.toIndex);
    if (cmd.type === 'set')    console.log('set',    cmd.pks);
  }
});

// Read current state without commands
queue.getPksByKey('main');       // TPk[]
queue.getEntitiesByKey('main');  // (TEntity | undefined)[] — holes preserved
```

If multiple operations happen in one flush, they are buffered in order. If a `set` is mixed with incremental ops, the stream collapses everything into one `set` command.

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

Selectors skip delivery if the value hasn't changed (`Object.is` by default).

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

## Reference

### `indexFactory` methods

| Method | Returns | Use for |
|---|---|---|
| `derivedSetIndex(fn, opts?)` | `OIMDerivedCollectionIndexSetBased` | Auto-maintained, unordered |
| `derivedArrayIndex(fn, opts?)` | `OIMDerivedCollectionIndexArrayBased` | Auto-maintained, ordered |
| `setBasedIndex(opts?)` | `OIMReactiveCollectionIndexManualSetBased` | Manual, unordered |
| `arrayBasedIndex(opts?)` | `OIMReactiveCollectionIndexManualArrayBased` | Manual, ordered |
| `orderedList(opts?)` | `OIMCollectionOrderedListCommandStream` | Incremental commands |
| `orderedIndex()` | `OIMCollectionIndexManualOrderedArrayBased` | Slot-first ordered index |

### `select` methods

| Method | Returns |
|---|---|
| `byPk(pk)` | `OIMCollectionByPkSelector` — `TEntity \| undefined` |
| `byPks(pks)` | `OIMCollectionByPksSelector` — `(TEntity \| undefined)[]` |
| `entitiesBySetIndexKey(index, key)` | `OIMEntitiesByIndexKeySetBasedSelector` — `(TEntity \| undefined)[]` |
| `entitiesByArrayIndexKey(index, key)` | `OIMEntitiesByIndexKeyArrayBasedSelector` — `(TEntity \| undefined)[]` |
