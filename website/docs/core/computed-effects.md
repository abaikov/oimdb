---
sidebar_position: 3
---

# Effects and Computed

`OIMEffect` and `OIMComputed` are the reactive primitives for side effects and derived values. They run through `OIMComputeRuntime`, which hooks into the same event queue flush cycle as collections and indexes.

## OIMComputeRuntime

One runtime per queue. Pass it to every effect and computed you create.

```typescript
import { OIMEventQueue, OIMComputeRuntime, OIMEventQueueSchedulerFactory } from '@oimdb/core';

const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask(),
});
const runtime = new OIMComputeRuntime(queue);
```

Effects and computeds run on `AFTER_FLUSH` — after the queue has delivered all subscription notifications for that tick. This means by the time `run()` or `compute()` executes, all collection/index state is already settled.

## OIMEffect

Subscribes to dependencies and calls `run()` when any of them change. Multiple invalidations within the same flush coalesce into a single run.

```typescript
import {
  OIMEffect,
  OIMEffectDependencyKeyedCollection,
  OIMEffectDependencyKeyedIndex,
} from '@oimdb/core';

const effect = new OIMEffect(runtime, {
  deps: [
    new OIMEffectDependencyKeyedCollection(users, 'user1'),   // one PK
    new OIMEffectDependencyKeyedIndex(roleIndex, 'admin'),    // one index key
  ],
  run: () => {
    const user = users.getOneByPk('user1');
    const admins = roleIndex.getPksByKey('admin');
    sendToServer({ user, admins });
  },
});

// Cleanup
effect.destroy();
```

`onUpdate?` fires immediately when a dep is invalidated (before the flush), useful for marking derived state as dirty early:

```typescript
const effect = new OIMEffect(runtime, {
  deps: [...],
  onUpdate: () => { isDirty = true; },  // fires during flush
  run: () => { /* fires after flush */ },
});
```

## OIMComputed

Derives a value from dependencies. Recomputes on next `queue.flush()` when deps change, notifies subscribers only if the value actually changed.

```typescript
import { OIMComputed, OIMEffectDependencyKeyedIndex } from '@oimdb/core';

const adminCount = new OIMComputed<number>(runtime, {
  deps: [new OIMEffectDependencyKeyedIndex(roleIndex, 'admin')],
  compute: () => roleIndex.getPksByKey('admin').size,
  // compare?: (a, b) => boolean  — defaults to Object.is
});

roleIndex.setPks('admin', ['u1', 'u2']);
queue.flush();

console.log(adminCount.get());       // 2 — triggers recompute if dirty
console.log(adminCount.getIfReady()); // 2 — returns undefined if never computed
console.log(adminCount.isReady);      // true
console.log(adminCount.needsRecompute); // false

// Subscribe to value changes
const off = adminCount.updateEventEmitter.subscribeOnKey('value', () => {
  console.log('new count:', adminCount.get());
});

adminCount.destroy();
```

`compute()` is called lazily: first time on `get()`, then on each flush where deps changed.

## Dependency types

| Class | Watches |
|---|---|
| `OIMEffectDependencyKeyedCollection(collection, pk \| pk[])` | Specific PKs in a `OIMReactiveCollection` |
| `OIMEffectDependencyKeyedIndex(index, key \| key[])` | Specific keys in any reactive index |
| `OIMEffectDependencyKeyedObject(obj, key \| key[])` | Specific keys in a `OIMReactiveObject` |
| `OIMEffectDependencyComputed(computed)` | Another `OIMComputed` |

All accept a single key or an array of keys.

## Computed chains

Use `OIMEffectDependencyComputed` to chain computeds. Just pass the computed instance directly:

```typescript
import { OIMEffectDependencyComputed } from '@oimdb/core';

const total = new OIMComputed<number>(runtime, {
  deps: [new OIMEffectDependencyKeyedIndex(priceIndex, 'cart')],
  compute: () => priceIndex.getPksByKey('cart')
    .reduce((sum, pk) => sum + (products.getOneByPk(pk)?.price ?? 0), 0),
});

const totalWithTax = new OIMComputed<number>(runtime, {
  deps: [new OIMEffectDependencyComputed(total)],
  compute: () => (total.get() ?? 0) * 1.2,
});
```

## Effects vs Computed vs Selectors

| | Use for | Output |
|---|---|---|
| `OIMEffect` | Side effects: logging, API calls, store writes | Calls `run()` |
| `OIMComputed` | Derived values shared across multiple consumers | `.get()`, notifies subscribers |
| `OIMSelector` | Reactive reads with delivery to a callback (UI) | Calls `watch()` callback |

## Gotchas

- **No cycles** — if A depends on B and B depends on A the effect will invalidate endlessly.
- **Keep `compute()` pure** — writing to any store inside `compute()` causes re-entrancy bugs.
- **Don't create loops in `run()`** — effects that modify their own deps will re-fire every flush.
- **Always call `destroy()`** — effects hold subscriptions until destroyed; leaking them leaks memory.
