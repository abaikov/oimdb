---
sidebar_position: 2
description: A database with schemas — build your collections, indexes and computed values once inside new OIMDB({ createSchemas }), work through their slots, run effects with db.createEffect and deliver with db.flush().
---

# A database with schemas

An application builds one `OIMDB` and hands it a `createSchemas` function. The database calls it once, at the end
of its constructor, with itself as the argument; what the function returns is `db.schemas`. A schema is a plain
object you build from the store aggregates — a collection, an index on it, a computed value — so everything in it
runs on that one database, shares its channel and is delivered at its `db.flush()`.

```bash
npm install @oimdb/core
```

```typescript setup
import {
    OIMDB,
    createOIMEntitySlotCollectionStoreAggregate,
    createOIMSlotCollectionIndexStoreAggregate,
    createOIMSortedComputedService,
    createOIMSortedCollectionSingleSlotStoreAggregate,
    createOIMSingleSourceTrackingComputedService,
    createOIMSingleSlotStoreAggregate,
    createOIMEntityContentService,
} from '@oimdb/core';

type TCard = { id: string; deck: string; title: string; rank: number };
```

## Which API to write

| you are writing | what you call | the database |
|---|---|---|
| an application (the common case) | the store aggregates inside `createSchemas`, then slot methods and `db.createEffect` | `new OIMDB({ createSchemas })`, one per application; call `db.flush()` after a batch of writes |
| a library, SSR (a database per request), tests that need isolated databases | the same: call the function that builds the database once per request or test | one per request or test; two databases never share a flush |
| what the aggregates do not cover: set, sorted-at-write or custom bucket stores, composite or tree keys, positional bucket writes, column slots and column-group reads (`readEntity(group)`), custom writers, persist or devtools wiring | `@oimdb/core` services (`createOIMSlotCollectionService` and the rest) | the same `OIMDB` |

## Schemas

```typescript setup
const createCardSchema = (db: OIMDB) => {
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    const byDeck = createOIMSlotCollectionIndexStoreAggregate(cards, { keyOf: (card) => card.deck });
    return { cards, byDeck };
};

const createAppDB = () => new OIMDB({ createSchemas: (db) => ({ default: createCardSchema(db) }) });
```

```typescript
const db = createAppDB();
const schema = db.schemas.default;
```

A schema is a namespace, the way a schema is in PostgreSQL: it names things and nothing more. There is one channel
and one flush per database, whatever the number of schemas. Schemas may read each other: they are plain code inside
one function, so build the one that is read first and pass it to the next:

```typescript
type TConnection = { isOnline: boolean };

const createConnectionSchema = (db: OIMDB) => ({
    connections: createOIMEntitySlotCollectionStoreAggregate<TConnection>(db),
});

const createDeckSchema = (db: OIMDB, connectionSchema: ReturnType<typeof createConnectionSchema>) => {
    const deckCards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    const isOnline = () => connectionSchema.connections.getSlotByKey('self').entity?.isOnline === true;
    return { deckCards, isOnline };
};

const connectedDb = new OIMDB({
    createSchemas: (db) => {
        const connection = createConnectionSchema(db);
        return { connection, default: createDeckSchema(db, connection) };
    },
});
```

`db.schemas` has the type `createSchemas` returns. A database made without `createSchemas` has `db.schemas`
`undefined`.

## Entities

```typescript
const { cards } = createAppDB().schemas.default;

const ace = cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
ace === cards.getSlotByKey('c1');                  // true: the slot is the entity's identity
ace.updateEntity({ rank: 14 });
ace.entity;                                        // { id: 'c1', deck: 'spades', title: 'Ace', rank: 14 }
ace.clearSlotContent();                            // the entity is gone; a slot nothing holds goes with it

cards.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
cards.writeSlotContentByKey('c3', { id: 'c3', deck: 'hearts', title: 'Three', rank: 3 });
cards.getEntities();                               // [Two, Three]
cards.getEntityCount();                            // 2
```

`createOIMEntitySlotCollectionStoreAggregate<T>(db, options?)` is a collection of entities of type `T` keyed by a
string or a number. The collection writes one thing — the whole entity under a key — and hands out slots; every
other act is a method of the slot.

| Call | What it does |
|---|---|
| `cards.writeSlotContentByKey(key, entity)` | Writes the whole entity under the key and returns its slot. |
| `cards.getSlotByKey(key)` | The slot, minted if there is none; the db holds a minted slot until the next flush. |
| `cards.holdSlotByKey(key)` | The same slot, held by you until `slot.unholdSlot()`. |
| `cards.findSlotByKey(key)` | The filed slot or `undefined`; mints nothing. |
| `cards.hasSlotContentByKey(key)` | Whether the key has an entity. |
| `slot.entity` | The entity or `undefined`. Read inside `db.createEffect` or a computed, it makes the slot a source, so a later write to it, a first write included, wakes the reader. |
| `slot.updateEntity(patch)`, `slot.updateEntityColumn(name, value)`, `slot.writeSlotContent(entity)` | Write the entity in place. |
| `slot.clearSlotContent()` | Takes the entity away. A slot nothing holds goes with it, so a later `getSlotByKey` returns a new one. |
| `cards.getEntities()` | Every entity. The order is not strict: roughly the order the entities got data, but a key read before its first write, or an entity cleared and refilled, can sit elsewhere; for a strict order, sort (see [A sorted list](#a-sorted-list)). No index needed. Read inside an effect or a computed, it wakes the reader when an entity is added, edited or deleted. |
| `cards.getEntityCount()` | How many entities there are; wakes the reader when one is added or deleted. |

The options are those of `createOIMSlotCollectionService` plus the entity content service's (`entityWriter`,
`slotReleasePolicy`, `columnNames`, …).

## One entity

```typescript
const createSettingsSchema = (db: OIMDB) => ({
    settings: createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<{ theme: string }>() }),
});
const { settings } = new OIMDB({ createSchemas: (db) => createSettingsSchema(db) }).schemas;

settings.writeSingleSlotContent({ theme: 'light' });
settings.getSingleSlot().updateEntity({ theme: 'dark' });
settings.getSingleSlot().entity;              // { theme: 'dark' }, tracked like any slot's entity
settings.getSingleSlot().clearSlotContent();
settings.hasSingleSlotContent();              // false
```

`createOIMSingleSlotStoreAggregate(db, { slotContentService })` holds one entity with no key:
`writeSingleSlotContent`, `getSingleSlot`, `holdSingleSlot`, `findSingleSlot`, `hasSingleSlotContent` and
`clearSingleSlotContent`; the slot has the same methods as a collection's.

## An index

```typescript
const { cards: deckCards, byDeck } = createAppDB().schemas.default;

deckCards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 14 });
deckCards.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
byDeck.getSlotByKey('spades').getBucketMemberSlotCount();   // 2
byDeck.getEntitiesByKey('spades');                          // [Ace, Two], in the order they joined

deckCards.getSlotByKey('c2').updateEntity({ deck: 'hearts' });
byDeck.getEntitiesByKey('spades');                          // [Ace]: the Two moved to 'hearts'
```

`createOIMSlotCollectionIndexStoreAggregate(collection, { keyOf })` files every entity of the collection under the
key `keyOf` returns, and moves it when that key changes; `{ columns: ['deck'] }` does the same from column values.

| Call | What it does |
|---|---|
| `byDeck.getEntitiesByKey(key)` | The entities filed under the key. Read inside an effect or a computed, it wakes the reader when one joins or leaves, and when one of them is edited. |
| `byDeck.getSlotByKey(key)` | The bucket slot: `getBucketMemberSlots()`, `getBucketMemberSlotCount()`, `hasBucketMemberSlot(slot)`, all tracked. |

## A sorted list

A whole collection sorts with `createOIMSortedCollectionSingleSlotStoreAggregate`, next to the collection in the
schema. Its `getSingleSlot().value` is every entity slot of the collection in order:

```typescript
const createRankedSchema = (db: OIMDB) => {
    const rankedCards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    return {
        rankedCards,
        byRank: createOIMSortedCollectionSingleSlotStoreAggregate(rankedCards, { sortColumns: [{ columnName: 'rank', direction: 'asc' }] }),
    };
};
const ranked = new OIMDB({ createSchemas: (db) => createRankedSchema(db) }).schemas;

ranked.rankedCards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 14 });
ranked.rankedCards.writeSlotContentByKey('c2', { id: 'c2', deck: 'hearts', title: 'Two', rank: 2 });
ranked.byRank.getSingleSlot().value.map((slot) => slot.entity?.title);   // ['Two', 'Ace']
```

It re-sorts when an entity arrives or leaves or a sort column is written; a write to another column does not wake
its reader. Given `{ comparator }` instead of `sortColumns`, any column write re-sorts.

A sorted list per key of an index is a computed service over the index, and its store aggregate is made from the
service's sorted store slot:

```typescript
const createRankSchema = (db: OIMDB) => {
    const rankCards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    const rankByDeck = createOIMSlotCollectionIndexStoreAggregate(rankCards, { keyOf: (card) => card.deck });
    const byRankService = createOIMSortedComputedService({ indexService: rankByDeck.slotService, sortColumns: [{ columnName: 'rank', direction: 'asc' }] });
    const byRank = byRankService.createStoreAggregate(byRankService.createSortedStoreSlot(rankByDeck.storeSlot));
    return { rankCards, byRank };
};
const { rankCards, byRank } = new OIMDB({ createSchemas: (db) => createRankSchema(db) }).schemas;

const rankAce = rankCards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 14 });
rankCards.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
byRank.getSlotByKey('spades').value.map((slot) => slot.entity?.title);   // ['Two', 'Ace']

rankAce.updateEntity({ rank: 1 });
byRank.getSlotByKey('spades').value.map((slot) => slot.entity?.title);   // ['Ace', 'Two']
```

`sortColumns` is a list of `{ columnName, direction: 'asc' | 'desc' }`; the next column breaks a tie. A key's value
is the bucket's member slots in that order; it re-sorts only when a member arrives or leaves or one of the sort
columns changes.

## Computed values and effects

```typescript
const createScoreSchema = (db: OIMDB) => {
    const scoreCards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    const totalService = createOIMSingleSourceTrackingComputedService<number>({
        derive: () => (scoreCards.getSlotByKey('c1').entity?.rank ?? 0) + (scoreCards.getSlotByKey('c2').entity?.rank ?? 0),
        initialValue: 0,
    });
    const total = totalService.createStoreAggregate(totalService.createStoreSlot(db));
    return { scoreCards, total };
};
const scoreDb = new OIMDB({ createSchemas: (db) => createScoreSchema(db) });
const { scoreCards, total } = scoreDb.schemas;

const stop = scoreDb.createEffect(() => {
    console.log('total', total.getSingleSlot().value);
});
// -> total 0, at once

scoreCards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
scoreCards.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
scoreDb.flush();
// -> total 3, once

stop();
```

**A computed is a store aggregate too.** `createOIMSingleSourceTrackingComputedService({ derive, initialValue })`
finds its sources by reading; `service.createStoreAggregate(service.createStoreSlot(db))`
makes the store, and `getSingleSlot().value` reads it. It derives lazily, only when read after a change. Its slot
goes when nothing holds it, like any slot, and the next read derives it again. A computed over named sources is
`createOIMSingleComputedService` (see [Computed values and effects](../core/computed-effects.md)).

**`db.createEffect(body, sourceSlots?, { lazy? })` is the effect door.** With no list, the effect depends on exactly
what its body read on its last run. With a list of slots, only those are sources, whatever the body reads:

```typescript
const watchDb = createAppDB();
const { cards: namedCards } = watchDb.schemas.default;
const namedAce = namedCards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
const namedTwo = namedCards.writeSlotContentByKey('c2', { id: 'c2', deck: 'hearts', title: 'Two', rank: 2 });
watchDb.flush();

const stopWatching = watchDb.createEffect(() => {
    console.log('ace is', namedAce.entity?.rank);
    return () => console.log('cleanup');
}, [namedAce]);
// -> ace is 1, at once

namedTwo.updateEntity({ rank: 3 });   // not a source: nothing runs
namedAce.updateEntity({ rank: 5 });
watchDb.flush();                      // -> cleanup, ace is 5

stopWatching();                       // -> cleanup
```

| Call | Sources | First run |
|---|---|---|
| `db.createEffect(body)` | what the body read | at once |
| `db.createEffect(body, slots)` | `slots` | at once |
| `db.createEffect(body, slots, { lazy: true })` | `slots` | at the first change |
| `db.createEffect(body, [])` | none | at once, and never again |

`lazy` applies only with a list of slots. A body may return a cleanup; it runs before the next run and on the
disposer `createEffect` returns. Computed slots cannot be passed in the list (excluded by type); read them through
`.value` in a body without a list. `OIMEffectService.INSTANCE` is the layer underneath, for what this door does not
pick.

## The database

A `new OIMDB()` with no `channelScheduler` delivers nothing until `db.flush()`, and then every write since the last
flush reaches each effect once. Call it where a batch of writes ends — after a response is applied, at the end of an
event handler. Give the database a `channelScheduler` to have it flush by itself. A test, a server request or a
library that must not share the application's database builds its own: call the function that makes it once per
test or request. `db.dispose()` drops a database when it is done: no later flush delivers, its effects stop and its
release wheels are cancelled, so a test builds one and disposes it after.

## With React

`useOIMSourceTrackingValue` from `@oimdb/react` re-renders on whatever its function read, the way a tracking
effect does, and `<OIMDBProvider>` takes the database. `useOIMDB()` returns it typed `OIMDB`;
`useOIMDB.withTypes<ReturnType<typeof createAppDB>>()` makes the application's own hook, typed with its schemas, once. A write re-renders at the next `db.flush()`, so a handler
that writes flushes when it is done:

```tsx file=oimdb-todos.tsx
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMDBProvider, useOIMDB, useOIMSourceTrackingValue } from '@oimdb/react';

type TTodo = { id: string; title: string; done: boolean };

const createTodoSchema = (db: OIMDB) => ({ todos: createOIMEntitySlotCollectionStoreAggregate<TTodo>(db) });
const createAppDB = () => new OIMDB({ createSchemas: (db) => ({ default: createTodoSchema(db) }) });
const useAppDB = useOIMDB.withTypes<ReturnType<typeof createAppDB>>();

const db = createAppDB();
db.schemas.default.todos.writeSlotContentByKey('t1', { id: 't1', title: 'Buy milk', done: false });

function Todo({ id }: { id: string }) {
    const db = useAppDB();
    const { todos } = db.schemas.default;
    const todo = useOIMSourceTrackingValue(() => todos.getSlotByKey(id).entity, [todos, id]);
    if (todo === undefined) return null;
    const toggle = () => {
        todos.getSlotByKey(id).updateEntity({ done: !todo.done });
        db.flush();
    };
    return <li onClick={toggle}>{todo.done ? '✓ ' : ''}{todo.title}</li>;
}

export const App = () => <OIMDBProvider db={db}><ul><Todo id="t1" /></ul></OIMDBProvider>;
```

## Under the aggregates

| Aggregate | The same through the services |
|---|---|
| `createOIMEntitySlotCollectionStoreAggregate<T>(db, options)` | `createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<T>(), … })` and its `createStoreAggregate(service.createStoreSlot(db))` |
| `cards.getEntities()` | reads `OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(cards.storeSlot)` |
| `createOIMSingleSlotStoreAggregate(db, options)` | `createOIMSingleSlotService(options)` and its `createStoreAggregate(service.createStoreSlot(db))` |
| `createOIMSlotCollectionIndexStoreAggregate(cards, options)` | `createOIMSlotCollectionIndexService({ entityService: cards.slotService, … })` and its `createIndexStoreSlot(cards.storeSlot)` |
| `createOIMSortedCollectionSingleSlotStoreAggregate(cards, options)` | a `createOIMSingleComputedService` over `OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(cards.storeSlot)` and its `getBucketColumn` per sort column |
| `db.createEffect(body)` | `OIMEffectService.INSTANCE.createSourceTrackingEffect(db, body)` |
| `db.createEffect(body, slots)` | `OIMEffectService.INSTANCE.createAndRunEffect(db, body, slots)`, or `createEffect` when `lazy` |

The services are where the strategies are picked: release policies, bucket orders, hand-filled buckets, composite
keys. The [Quick Start](./quick-start.md) walks through them.
