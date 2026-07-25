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
| `OIMEffectDependencyKeyedCollection(collection, pk)` | One PK in a `OIMReactiveCollection` |
| `OIMEffectDependencyKeyedIndex(index, key)` | One key in any reactive index |
| `OIMEffectDependencyKeyedObject(obj, key)` | One key in a `OIMReactiveObject` |
| `OIMEffectDependencyComputed(computed)` | Another `OIMComputed` |

Each dependency watches exactly **one** key — the argument is the whole key, so a composite key `[a, b]` is one key, not two. To depend on several keys, add several dependencies to the `deps` array.

## Ergonomic facade — `kit.computed` / `kit.effect` / `on`

You rarely need the classes above directly. A collection kit fronts the compute system: `on.*` builds the dependencies and `kit.computed` / `kit.effect` create nodes on the queue's **shared** runtime (so a computed can depend on selectors and on other collections that share the queue) and register them in `kit.scope` for teardown.

```ts
import { createOIMCollectionKit, on } from '@oimdb/core';

const users = createOIMCollectionKit<User, string>(queue, { selectPk: (u) => u.id });
const orders = createOIMCollectionKit<Order, string>(queue, { selectPk: (o) => o.id });

const summary = users.computed(
    [on.collection(users.collection, 'u1'), on.collection(orders.collection, 'o1')],
    () => `${users.collection.getOneByPk('u1')?.name}: ${orders.collection.getOneByPk('o1')?.total}`,
);

users.effect([on.computed(summary)], () => console.log(summary.get()));
```

`on` builders: `on.collection(collection, pk)`, `on.index(index, key)`, `on.object(object, key)`, `on.computed(computed)`. Outside a kit, `getOIMComputeRuntime(queue)` returns the one shared runtime for a queue.

## The runtime registry

Every computed, effect and selector sharing a queue must share **one** runtime: they form a single dependency graph, and topological levels only mean anything within one runtime. Two runtimes on the same queue drain in two separate passes, and the glitch-freedom guarantee between their nodes is lost.

The mapping is keyed by queue — there is no global instance, so two queues get two independent runtimes and tests need nothing reset between them.

```typescript
import {
    getOIMComputeRuntime,
    peekOIMComputeRuntime,
    setOIMComputeRuntime,
} from '@oimdb/core';

const runtime = getOIMComputeRuntime(queue);   // created on first use

peekOIMComputeRuntime(queue);                  // the runtime, or undefined — never creates
```

| Function | Use |
|---|---|
| `getOIMComputeRuntime(queue)` | The runtime for a queue, created on first use. A destroyed runtime is replaced, never handed back. |
| `peekOIMComputeRuntime(queue)` | Read without creating — devtools asking whether a queue has a compute graph at all, teardown checking whether there is anything to destroy, assertions in tests. A destroyed runtime reads as `undefined`. |
| `setOIMComputeRuntime(queue, runtime)` | Install your own — an instrumented subclass that records levels and drain order, a profiling runtime, a test double. |

`setOIMComputeRuntime` throws if `runtime.queue !== queue` (a runtime drains on its own queue's flush, so a mismatched pair would never run). Install it **before** anything builds the graph: nodes capture their runtime at construction, so swapping afterwards leaves existing nodes on the old instance and splits the graph in two — exactly the problem the one-runtime-per-queue rule prevents. Replacing does not destroy the previous runtime; whoever installs a replacement decides whether the old one still has live nodes.

### Destroying a runtime

```typescript
runtime.destroy();
runtime.isDestroyed; // true
```

`destroy()` detaches the runtime from the queue's `AFTER_FLUSH` and drops all pending work. It is idempotent, and it does **not** destroy the computeds and effects scheduled on it — destroy those first, then the runtime.

Without it the `AFTER_FLUSH` subscription lives as long as the queue does, even once every node is gone. That is harmless in itself (the handler early-returns when nothing is scheduled), but it cannot be unwound, which matters for a long-lived queue whose compute graph is torn down and rebuilt.

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
