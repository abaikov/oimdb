---
sidebar_position: 2
description: How to provide the database to React and read it with one hook, useOIMSelector, which re-renders a component when what it read changes.
---

# React

React bindings for `@oimdb/core`: one hook, plus shorthands over it. `useOIMSelector(db => …)` hands your function the database the
provider holds. It renders what the function returns, and it re-renders the component when something the function
read changes: an entity, one column of it, a computed value, a bucket's members. Nothing else wakes it.

```bash
npm install @oimdb/react @oimdb/core
```

## In one minute

```tsx
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate, createOIMSlotCollectionIndexStoreAggregate } from '@oimdb/core';
import { OIMDBProvider, useOIMSelector } from '@oimdb/react';

type TTodo = { id: string; title: string; status: 'open' | 'done' };

const createAppDB = () => new OIMDB({
    channelScheduler: flush => { void Promise.resolve().then(flush); },
    createSchemas: db => {
        const todos = createOIMEntitySlotCollectionStoreAggregate<TTodo>(db);
        const todosByStatus = createOIMSlotCollectionIndexStoreAggregate(todos, { selectKey: (todo: TTodo) => todo.status });
        return { default: { todos, todosByStatus } };
    },
});
const db = createAppDB();
const useAppSelector = useOIMSelector.withTypes<typeof db>();

db.schemas.default.todos.writeSlotContentByKey('t1', { id: 't1', title: 'Buy milk', status: 'open' });
db.schemas.default.todos.writeSlotContentByKey('t2', { id: 't2', title: 'Call mum', status: 'open' });

function Todo({ id }: { id: string }) {
    const todo = useAppSelector(appDb => appDb.schemas.default.todos.getSlotByKey(id).entity);
    if (todo === undefined) return null;
    const finish = () => { db.schemas.default.todos.getSlotByKey(id).updateEntity({ status: 'done' }); };
    return <li onClick={finish}>{todo.title}</li>;
}

function OpenTodos() {
    const ids = useAppSelector(appDb =>
        Array.from(appDb.schemas.default.todosByStatus.getSlotByKey('open').getBucketMemberSlots(), member => String(member.key)));
    return <ul>{ids.map(id => <Todo key={id} id={id} />)}</ul>;
}

export const App = () => <OIMDBProvider db={db}><OpenTodos /></OIMDBProvider>;
```

When you click a todo, the write is delivered at the next microtask, the flush the `channelScheduler` asks for.
`OpenTodos` re-renders because the bucket's membership changed, and no `Todo` re-renders: each `Todo` read only its
own entity.

## The hook

```ts signature
function useOIMSelector<TValue, TDB extends OIMDB = OIMDB>(select: (db: TDB) => TValue): TValue;
useOIMSelector.withTypes<TDB extends OIMDB>(): <TValue>(select: (db: TDB) => TValue) => TValue;
```

- **`select` is called with the provider's database.** `useOIMSelector.withTypes<typeof db>()` types that
  database once, so `db.schemas` needs no cast. It is the same hook, the way `useOIMDB.withTypes` is.
- **The component re-renders when a tracked source changes.** Results are never compared. Under the default in-place
  entity writer, a written entity keeps its object reference, so a comparison would freeze the component.
- **`select` runs once per change.** The render runs it while tracking what it reads. The commit hands those sources
  to the subscription (`OIMEffectService.subscribeEffectToTrackedSources`). A flush only tells React to render.
- **Props are just closure.** When a key from props moves, the commit moves the subscription to the slot that key
  names, and the slot it left stops waking the component.
- **A write between render and commit is still shown.** The first subscription costs one extra render. When the
  sources move, or one of them was written after the render, the commit asks for one more render.
- **An error in `select` goes to the error boundary**, because `select` only runs during render.
- **One selector reads one database**: the provider's. A slot filed on another `OIMDB` is refused with an error that
  names `useOIMSelector`. Without that refusal a write to it would never wake the component.

## Shorthand hooks

Each one is a single `useOIMSelector` call. It takes the aggregate you hold and is named for what it returns:

| Hook | Is |
|---|---|
| `useOIMEntityByKey(cards, id)` | `useOIMSelector(() => cards.getSlotByKey(id).entity)` |
| `useOIMEntities(cards)` | `useOIMSelector(() => cards.getEntities())` |
| `useOIMEntitiesByKey(cardsByDeck, deck)` | `useOIMSelector(() => cardsByDeck.getEntitiesByKey(deck))` |
| `useOIMBucketMemberKeysByKey(cardsByDeck, deck)` | the member keys of that bucket, for a list of rows |
| `useOIMComputedValueByKey(scores, id)` | `useOIMSelector(() => scores.getSlotByKey(id).value)` |
| `useOIMSingleEntity(viewer)` | `useOIMSelector(() => viewer.getSingleSlot().entity)` |
| `useOIMSingleComputedValue(total)` | `useOIMSelector(() => total.getSingleSlot().value)` |

Each parameter is typed by the one method the hook calls (`getSlotByKey`, `getEntities`, `getEntitiesByKey`,
`getSingleSlot`). So any aggregate that has that method fits, a computed one included
(`computedService.createStoreAggregate(storeSlot)`). `useOIMEntities` and `useOIMEntitiesByKey` read every
member's entity, so they wake on any member write. For a long list, select keys and let each row read its own.

## What wakes it

| Read inside `select` | Wakes on |
|---|---|
| `slot.entity` | any write to that entity |
| `slot.getEntity(createOIMColumnGroup(['title']))` | a write to `title` only |
| `columnSlot.value` | that column |
| `computedSlot.value` | the computed's value moving (a `sameValueGuard` that calls it equal renders nothing) |
| `bucketSlot.getBucketMemberSlots()`, `getBucketMemberSlotCount()`, `hasBucketMemberSlot()` | membership |
| `collection.getEntities()`, `getEntityCount()` | the whole population |

`peekSlotByKey`, `hasSlotContentByKey`, `getSlots` and `getSlotCount` do not track. A selector that reads only
them renders once and never again.

## Lists

A list selects keys, and each row selects its own entity by key, the way Redux lists are written. The list then
re-renders on membership only, and a row on its own entity only. A `React.memo` row gets a primitive `id` prop, so
it stays put when the list re-renders.

## A derivation

A derivation used by one component is the selector itself: `useOIMSelector(db => db.schemas.default.todos.getEntityCount())`.
A derivation shared by several components is a computed service built next to the database, read through
`computedSlot.value`. A component that wants a computed of its own builds it in `useMemo` and reads it with the
same selector.

## Things worth knowing

- **Writes need no hook.** Write straight on the aggregate: `todos.getSlotByKey(id).updateEntity(patch)`,
  `todos.writeSlotContentByKey(id, entity)`.
- **A database without a `channelScheduler` delivers only on `db.flush()`.** Pass a microtask or
  `requestAnimationFrame` scheduler, or call `flush()` yourself.
- **The subscription holds what it read, and gives it back on unmount**, so an empty slot a component is waiting on
  stays filed until its value arrives.
- **StrictMode in development subscribes, unsubscribes and subscribes again**, so a slot subscription listener
  hears `onSlotFirstSubscribed` twice for the same slot.

## Reference

[Reading and subscribing](/docs/core/reading-subscribing) covers what a tracked read is.
[Recipes: React](/docs/recipes/react) has one recipe per task.
