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

`onUpdate?` fires *during* the flush, when the invalidated dependency's change is delivered — earlier than `run()` (which fires at `AFTER_FLUSH`), but not at write time. Useful for marking derived state dirty before the recompute runs:

```typescript
const effect = new OIMEffect(runtime, {
  deps: [...],
  onUpdate: () => { isDirty = true; },  // during flush, on dep delivery
  run: () => { /* at AFTER_FLUSH, after all deps delivered */ },
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

## Disposing everything at once — `OIMDisposeScope`

Teardown is LIFO: dispose dependents before what they depend on (effects / indexes / selectors → collection → queue). Rather than tracking that order by hand, register into an `OIMDisposeScope` as you build:

```typescript
import { OIMDisposeScope, OIMEventQueue, OIMReactiveCollection } from '@oimdb/core';

const scope = new OIMDisposeScope();
const queue = scope.add(new OIMEventQueue());
const users = scope.add(new OIMReactiveCollection(queue, { selectPk: (u) => u.id }));
const byTeam = scope.add(users.indexFactory.setBasedIndex());
scope.add(effect); // any { destroy() }
scope.add(selector.watch(render)); // …or a bare () => void unsubscribe

scope.destroy(); // disposes in reverse registration order — no manual bookkeeping
```

`add(x)` returns `x` for inline capture. It accepts both `{ destroy(): void }` objects and bare `() => void` unsubscribe functions (selectors, per-key subscriptions and scheduler tasks expose only the latter). It is idempotent, disposes every item even if one throws (rethrowing the first error afterwards), and nests via `child()`. Factory: `createOIMDisposeScope()`.
