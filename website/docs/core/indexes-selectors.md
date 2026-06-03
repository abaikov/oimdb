---
sidebar_position: 2
---

# Indexes and Selectors

Indexes are collection-bound structures created via `indexFactory`. They live next to the collection but are not stored inside it.

Selectors deliver reactive values to a callback. They coalesce multiple invalidations within a flush into a single delivery.

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

## Manual indexes

Use when membership comes from outside the entity: search results, server ordering, permissions, UI state.

```typescript
// Set-based — unordered membership
const adminUsers = users.indexFactory.setBasedIndex<string>();
adminUsers.setPks('active', ['u1', 'u2']);
adminUsers.addPks('active', ['u3']);
adminUsers.removePks('active', ['u1']);

// Array-based — ordered, full-replace writes
const searchResults = users.indexFactory.arrayBasedIndex<string>();
searchResults.setPks('query:alice', ['u3', 'u1']);
```

### Index reads

Both types expose the same read API:

```typescript
index.getPksByKey('key');          // Set<TPk> or TPk[]
index.getEntitiesByKey('key');     // TEntity[] (reads slot.item directly, no extra lookup)
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
queue.getEntitiesByKey('main');  // TEntity[]
```

If multiple operations happen in one flush, they are buffered in order. If a `set` is mixed with incremental ops, the stream collapses everything into one `set` command.

## Selectors

The `select` facade on `createOIMCollectionContext` covers the most common patterns:

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
