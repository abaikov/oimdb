---
sidebar_position: 2
description: The short API, @oimdb/core/oim — entity collections, single entities, indexes, computed values and effects over one default database that delivers by itself.
---

# The short API: `@oimdb/core/oim`

`@oimdb/core/oim` is the shortest way to use OIMDB: a handful of functions over one default database
that delivers every write of a turn in one flush on a microtask. It builds on the same engine as
the rest of these pages; everything it returns also exposes the full API underneath.

```bash
npm install @oimdb/core
```

```typescript setup
import * as oim from '@oimdb/core/oim';

type TCard = { id: string; deck: string; title: string; rank: number };
```

## Entities

```typescript
const cards = oim.entities<TCard>();

const ace = cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
ace === cards.getSlotByKey('c1');                  // true: the slot is the entity's identity
cards.updateEntityByKey('c1', { rank: 14 });      // true; false when there is no entity under the key
cards.getEntityByKey('c1');                        // { id: 'c1', deck: 'spades', title: 'Ace', rank: 14 }
cards.deleteEntityByKey('c1');                     // true; false when there was nothing to delete
```

`oim.entities<T>()` is a collection of entities of type `T` keyed by a string or a number. It returns an
`OIMEntityCollection`:

| Method | What it does |
|---|---|
| `upsertEntityByKey(key, entity)` | Writes the whole entity under the key and returns its slot, the entity's identity. |
| `updateEntityByKey(key, patch)` | Patches the entity; `false` if the key has no entity. |
| `getEntityByKey(key)` | The entity or `undefined`. Read inside `oim.effect` or `oim.computed`, it makes that key a source, so a later write to it, an insert included, wakes the reader. |
| `deleteEntityByKey(key)` | Takes the entity away; `false` if there was none. A slot nothing holds goes with it, so a later `getSlotByKey` returns a new one. |
| `getSlotByKey(key)` | The slot. Write through it (`slot.updateEntity(patch)`) to skip the key lookup on a hot path. |

The options are those of `createOIMEntitySlotCollectionStoreAggregate` (`entityWriter`,
`slotReleasePolicy`, `columnNames`, …). `cards.slotCollectionStoreAggregate` is the collection's store
aggregate, for everything the short API does not cover.

## One entity

```typescript
const settings = oim.entity<{ theme: string }>();

settings.upsertEntity({ theme: 'light' });
settings.updateEntity({ theme: 'dark' });    // true
settings.getEntity();                         // { theme: 'dark' }, tracked like getEntityByKey
settings.deleteEntity();                      // true
```

`oim.entity<T>()` holds one entity with no key: `upsertEntity`, `updateEntity`, `getEntity`, `deleteEntity` and
`getSlot`, and `singleSlotStoreAggregate` underneath.

## An index

```typescript
const deckCards = oim.entities<TCard>();
const byDeck = oim.index(deckCards, { keyOf: (card) => card.deck });

deckCards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 14 });
deckCards.upsertEntityByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
byDeck.getEntityCountByKey('spades');        // 2
byDeck.getEntitiesByKey('spades');           // [Ace, Two], in the order they joined

deckCards.updateEntityByKey('c2', { deck: 'hearts' });
byDeck.getEntitiesByKey('spades');           // [Ace]: the Two moved to 'hearts'
```

`oim.index(collection, { keyOf })` files every entity of the collection under the key `keyOf` returns, and moves
it when that key changes; `{ columns: ['deck'] }` does the same from column values. It returns an
`OIMEntityIndex`:

| Method | What it does |
|---|---|
| `getEntitiesByKey(key)` | The entities filed under the key. Read inside `oim.effect` or `oim.computed`, it wakes the reader when one joins or leaves, and when one of them is edited. |
| `getEntityCountByKey(key)` | How many there are; tracked the same way. |
| `getSlotByKey(key)` | The bucket slot, for the full API. |

`byDeck.indexStoreAggregate` is the index's store aggregate, for everything else.

## A sorted index

```typescript
const rankCards = oim.entities<TCard>();
const rankByDeck = oim.index(rankCards, { keyOf: (card) => card.deck });
const byRank = oim.sorted(rankByDeck, [{ columnName: 'rank', direction: 'asc' }]);

rankCards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 14 });
rankCards.upsertEntityByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
byRank.getEntitiesByKey('spades');           // [Two, Ace]

rankCards.updateEntityByKey('c1', { rank: 1 });
byRank.getEntitiesByKey('spades');           // [Ace, Two]
```

`oim.sorted(index, sortColumns)` keeps each bucket of the index in the order of `sortColumns`, each a
`{ columnName, direction: 'asc' | 'desc' }`; the next column breaks a tie. It returns an `OIMSortedEntityIndex`:
`getEntitiesByKey(key)` answers in that order and is tracked like the index's, and it re-sorts only when a
member arrives or leaves or one of the sort columns changes. `getSlotByKey(key)` is the sorted computed slot;
`sortedComputedService` and `sortedStoreSlot` are the full API underneath.

## Computed values and effects

```typescript
const scoreCards = oim.entities<TCard>();
const total = oim.computed(() => (scoreCards.getEntityByKey('c1')?.rank ?? 0) + (scoreCards.getEntityByKey('c2')?.rank ?? 0));

const stop = oim.effect(() => {
    console.log('total', total.value);
});
// -> total 0, at once

scoreCards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
scoreCards.upsertEntityByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
// -> total 3, once, on the next microtask

stop();
```

**Sources are found by reading.** With no second argument, `oim.computed(derive)` and `oim.effect(body)`
depend on exactly what they read on their last run, and re-run when one of those moves. A computed is
read through `.value` and derives lazily, only when read after a change.

**Or named.** With a list of slots as the second argument, only those are sources, whatever the body reads:

```typescript
const rankCards = oim.entities<TCard>();
const ace = rankCards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
const two = rankCards.upsertEntityByKey('c2', { id: 'c2', deck: 'hearts', title: 'Two', rank: 2 });

const doubled = oim.computed(() => (ace.entity?.rank ?? 0) * 2, [ace]);

const stopWatching = oim.effect(() => {
    console.log('ace is', ace.entity?.rank);
    return () => console.log('cleanup');
}, [ace]);
// -> ace is 1, at once

two.updateEntity({ rank: 3 });   // not a source: nothing runs
ace.updateEntity({ rank: 5 });   // -> cleanup, ace is 5

stopWatching();                  // -> cleanup
console.log(doubled.value);      // 10
```

| Call | Sources | First run |
|---|---|---|
| `oim.effect(body)` | what the body read | at once |
| `oim.effect(body, slots)` | `slots` | at once |
| `oim.effect(body, slots, { lazy: true })` | `slots` | at the first change |
| `oim.effect(body, [])` | none | at once, and never again |

A body may return a cleanup; it runs before the next run and on `stop()`. Every effect returns its `stop`.

A computed made by `oim.computed` is held until you give it back: make it once, at module scope, or call
`total.unholdSlot()` when you are done with it.

## The database

`oim.db()` is the default `OIMDB`, made on first use, whose writes are delivered in one flush on a
microtask: every write of a synchronous turn reaches each effect once. Everything in `@oimdb/core/oim` runs on
it; an index and a sorted index run on the database of the collection they index.

## Your own database: `@oimdb/core/oimdb`

A test that flushes by hand, one database per request on a server, or a library that must not share the
application's database takes `@oimdb/core/oimdb`: the same names, with the database as the first argument.

```typescript
import * as oimdb from '@oimdb/core/oimdb';
import { OIMDB } from '@oimdb/core';

const requestDb = new OIMDB();
const requestCards = oimdb.entities<TCard>(requestDb);
const requestByDeck = oimdb.index(requestCards, { keyOf: (card) => card.deck });
const seen: number[] = [];
const stopRequest = oimdb.effect(requestDb, () => { seen.push(requestByDeck.getEntityCountByKey('spades')); });

requestCards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
requestDb.flush();   // seen: [0, 1]
stopRequest();
```

| `@oimdb/core/oim` | `@oimdb/core/oimdb` |
|---|---|
| `oim.entities<T>(options?)` | `oimdb.entities<T>(db, options?)` |
| `oim.entity<T>()` | `oimdb.entity<T>(db)` |
| `oim.index(collection, options)` | `oimdb.index(collection, options)`, on the collection's database |
| `oim.sorted(index, sortColumns)` | `oimdb.sorted(index, sortColumns)`, on the index's database |
| `oim.computed(derive, slots?)` | `oimdb.computed(db, derive, slots?)` |
| `oim.effect(body, slots?, { lazy? })` | `oimdb.effect(db, body, slots?, { lazy? })` |

Both entries import `@oimdb/core`, so an application that uses them loads one copy of the engine. A
`new OIMDB()` without a `channelScheduler` delivers on `db.flush()`; give it one to have it flush by itself.

## With React

`useOIMSourceTrackingValue` from `@oimdb/react` re-renders on whatever its function read, the way `oim.effect`
does, and `<OIMDBProvider>` takes `oim.db()`:

```tsx file=oim-todos.tsx
import * as oim from '@oimdb/core/oim';
import { OIMDBProvider, useOIMSourceTrackingValue } from '@oimdb/react';

type TTodo = { id: string; title: string; done: boolean };

const todos = oim.entities<TTodo>();
todos.upsertEntityByKey('t1', { id: 't1', title: 'Buy milk', done: false });

function Todo({ id }: { id: string }) {
    const todo = useOIMSourceTrackingValue(() => todos.getEntityByKey(id), [todos, id]);
    if (todo === undefined) return null;
    return <li onClick={() => todos.updateEntityByKey(id, { done: !todo.done })}>{todo.done ? '✓ ' : ''}{todo.title}</li>;
}

export const App = () => <OIMDBProvider db={oim.db()}><ul><Todo id="t1" /></ul></OIMDBProvider>;
```

## Under the short API

| `oim` | The same through the full API |
|---|---|
| `oim.entities<T>(options)` | `createOIMEntitySlotCollectionStoreAggregate<T>(db, options)` |
| `oim.entity<T>()` | `createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<T>() })` |
| `oim.index(collection, options)` | `createOIMSlotCollectionIndexStoreAggregate(collection.slotCollectionStoreAggregate, options)` |
| `oim.sorted(index, sortColumns)` | `createOIMSortedComputedService({ indexService, sortColumns })` and its `createSortedStoreSlot` |
| `oim.computed(derive)` | `createOIMSingleSourceTrackingComputedService({ derive })` |
| `oim.computed(derive, slots)` | `createOIMSingleComputedService({ derive, createSources })` |
| `oim.effect(body)` | `OIMEffectService.INSTANCE.createSourceTrackingEffect(db, body)` |
| `oim.effect(body, slots)` | `OIMEffectService.INSTANCE.createAndRunEffect(db, body, slots)`, or `createEffect` when `lazy` |

The full API is where the strategies are picked: release policies, bucket orders, hand-filled buckets,
composite keys, more than one store per type. The [Quick Start](./quick-start.md) walks through it.

`@oimdb/core/oim` is a separate entry of the same package: it imports `@oimdb/core`, so an
application that uses both loads one copy of the engine.
