---
sidebar_position: 1
---

# Performance

## Benchmarks

Numbers on an average laptop — treat as directional.

```bash
npx tsx packages/core/bench/index.ts
```

### Collection

| Operation | 1K entities | 100K entities | 1M entities |
|-----------|-------------|----------------|-------------|
| Insert | 6.2M/s | 2.1M/s | 600K/s |
| Update | 2.7M/s | 1.8M/s | 800K/s |
| Delete | 5.8M/s | 2.3M/s | 700K/s |
| Lookup | 9.8M/s | 9.5M/s | 9.2M/s |

### Schedulers

| Scheduler | Throughput | Best for |
|-----------|------------|---------|
| `createMicrotask()` | 2.4B/s | Default — same-tick delivery |
| `createImmediate()` | 1.8B/s | Tests |
| `createTimeout(0)` | 16M/s | Batch / import workloads |
| `createAnimationFrame()` | 8M/s | UI-aligned, React-friendly |

### Indexes

| Operation | 1K keys | 100K keys |
|-----------|---------|-----------|
| Set / Add / Remove | 6–8M/s | 1–2M/s |
| Lookup | 9.1M/s | 8.9M/s |

Computed values and effects run inside the same `queue.flush()` drain — derived recompute and subscriber delivery happen in the same pass.

## Compared to other state managers

Cross-library numbers measured in **three planes**, because they answer
different questions. These are **directional** — reproduce on your own
hardware/versions before quoting.

Run it and read every adapter yourself — nothing here is hand-waved:

- **Live benchmark:** [abaikov.github.io/cnstra-oimdb-bench](https://abaikov.github.io/cnstra-oimdb-bench/)
- **Source (all adapters):** [github.com/abaikov/cnstra-oimdb-bench](https://github.com/abaikov/cnstra-oimdb-bench)

Methodology that matters: production React build only (dev adds ~2×
`jsxDEV`/validation overhead and distorts everything), one update at a time via
`flushSync` (so this is CPU cost per update, not frame-paced perceived latency),
instrumentation kept out of the timing window.

### React throughput (production)

Cost of one entity update in a real React app (1500 components, 1 subscriber
each). Lower is better.

| Library (idiom) | µs/update | re-renders/update |
|---|---|---|
| MobX (deep, in-place) | 33.0 | 1 |
| MobX (ids-based) | 33.3 | 1 |
| **oimdb** | 33.4 | 1 |
| oimdb + cnstra (in-place) | 33.9 | 1 |
| oimdb + cnstra (ids-based) | 34.2 | 1 |
| Effector (atomic stores) | 36.1 | 1 |
| *— tier boundary —* | | |
| Effector (ids-based, Record copy) | 1,230 | 1 |
| Zustand (ids-based) | 2,372 | 1 |
| Redux Toolkit (ids-based) | 5,430 | 1 |

Inside the top tier the 33–36µs spread is **noise**: React's commit cost
dominates and swamps the store layer, so a 1–3µs lead is a coin flip that does
not reproduce. What React does *not* hide is **fine-grained
vs coarse** — stores that copy the whole collection and re-run every selector on
each update (effector-ids, zustand, redux) land 35–160× slower. oimdb sits
firmly in the fine-grained tier: on par with the best (MobX deep, atomic
Effector), without `observer` everywhere or a store-per-entity. The `re-renders
/update = 1` column confirms all fine-grained libraries invalidate equally
precisely — the difference is pure per-update CPU, not render volume.

### Data layer (no React)

Pure cost of a store update plus confirmed delivery to one subscriber per
entity — i.e. the end-to-end cost when there is **no React commit to hide
behind**. Lower is better.

| Layer | µs/update |
|---|---|
| oimdb in-place upsert + flush | 0.25 |
| oimdb merge upsert + flush | 0.34 |
| cnstra → oimdb (full stimulate) | 0.48 |
| MobX (deep in-place + reaction) | 0.67 |
| MobX (map.set + reaction) | 0.74 |
| Effector (atomic + watch) | 0.89 |
| Zustand (setState + N selectors) | 95 |
| Effector (record + useStoreMap) | 248 |
| Redux (dispatch + N selectors) | 302 |

oimdb leads here (~2–3× MobX). In a React app this ~0.4µs lives under a ~33µs
commit, so it is invisible end-to-end — the top table rules out any "faster in
your React app" claim. It becomes visible where the bottleneck *is* the data
layer and not the React commit:

- headless / non-render consumers — computed/effect graphs, persistence,
  server-side, data pipelines, game loops;
- cnstra-orchestrated flows (the `0.48µs` full stimulate above is already
  end-to-end — no React);
- high-frequency updates where thousands of entities change but only a few are
  on screen — the store cost is paid for all, the render only for the visible;
- fine-grained renderers (Solid/Svelte) whose per-update floor is low enough for
  the data-layer ranking to show through (lower floor → the 0.4µs is a larger
  share). This last case is plausible but **not yet measured here** — treat it
  as a hypothesis until there is a Solid/Svelte adapter on the same workload.

### Memory (steady-state heap, production)

Heap after GC with the same rendered DOM across all adapters (50,162 nodes).
Lower is better.

| Library (idiom) | heap MB |
|---|---|
| oimdb + cnstra (in-place) | 25.8 |
| oimdb + cnstra (ids-based) | 28.1 |
| oimdb (no cnstra) | 28.1 |
| Zustand (ids-based) | 30.2 |
| MobX (ids-based) | 31.5 |
| MobX (deep, in-place) | 37.4 |
| Redux Toolkit (ids-based) | 37.7 |
| Effector (ids-based) | 42.0 |
| Effector (atomic stores) | 89.7 |

Fast-tier trade-offs:

- oimdb/cnstra has the lightest footprint (25.8–28.1 MB); in-place mode trims it
  further by avoiding per-update allocation — the steady-state heap backs the
  allocation argument that a mean-µs number alone can't show.
- Atomic Effector is in the fast update tier (36µs) but costs **89.7 MB, ~3.5×
  the lightest** — a store + event per entity means thousands of units. It buys
  update speed with memory.
- MobX deep (37.4) is heavier than MobX ids (31.5): deep observables wrap every
  field in a proxy/atom. The "native" mode has its own memory cost.

Caveat: a single steady-state heap number doesn't capture GC pause
*distribution* — in-place's allocation savings mainly help tail latency under
sustained high-frequency updates, which this number only hints at.

**Bottom line:** oimdb is in the fast tier for React, the fastest measured at the
data layer, and the lightest in memory — with a real end-to-end win wherever the
data layer (not the React commit) is the bottleneck. It is *not* faster than
MobX/atomic-Effector *inside a React app* — React's commit floor erases that —
but it reaches the same tier without their memory cost (atomic Effector) or
`observer`/proxy overhead (MobX deep).

## Mutable mode (advanced)

By default entities are updated **immutably** (`{ ...prev, ...draft }`), so each update produces a new object reference — required for React's `Object.is` change detection (`useSyncExternalStore`). The copy is the largest per-update data-layer cost.

For update-heavy, fine-grained UIs you can update entities **in place** and bind with the lighter **signal hooks**:

```typescript
import { OIMReactiveCollection, createInPlaceEntityUpdater } from '@oimdb/core';
import { useSelectEntityByPkSignal } from '@oimdb/react';

const cards = new OIMReactiveCollection(queue, {
  selectPk: c => c.id,
  updateEntity: createInPlaceEntityUpdater(), // mutate in place — no per-update allocation
});

// Signal hooks re-render on the keyed notification (no Object.is), so they see
// in-place mutations that the default uSES hooks would miss.
const card = useSelectEntityByPkSignal(cards, id);
```

This drops both the merge copy and the `useSyncExternalStore` overhead — the per-update work MobX also avoids. It pays off where the **data layer** is the bottleneck (very fine-grained renderers, large update-heavy lists); in plain React the per-component commit dominates, so the win is small.

**Use only when every reader is subscription-driven.** Trade-offs: not Concurrent-Mode safe; the entity reference is stable across changes, so `React.memo` on entities, prev/next diffing, time-travel, and the default uSES hooks on the same collection won't see updates. Select each entity where you render it (by pk); don't pass mutable entities into `React.memo` children.

## Index membership writes

`addPks` / `removePks` are incremental (touch only the changed pks). For frequently changing membership prefer a **set-based** index — both add and remove are O(1) per pk; array-based add is O(1) but removal is O(bucket) (it preserves order). See [Indexes — set vs array](/docs/core/indexes-selectors).

## Key patterns

### Batch writes

```typescript
// ✅ single notification batch, slots reusable by indexes
const slots = users.upsertMany(largeUserArray);
rawIndex.setSlots('visible', slots);

// ❌ N pending notifications before flush
largeUserArray.forEach(user => users.upsertOne(user));
```

### Scheduler for bulk imports

`microtask` (default) is fastest for typical UI writes. For large bulk imports, use `timeout` to avoid blocking the event loop:

```typescript
const importQueue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createTimeout(0),
});
```

### Index comparators

Choosing the wrong comparator triggers unnecessary re-renders.

```typescript
// Order-sensitive (search results, ranked lists)
OIMIndexComparatorFactory.createElementWiseComparator<string>()

// Order-insensitive (tags, roles) — ignores reordering
OIMIndexComparatorFactory.createSetBasedComparator<string>()

// Always notify (external ordering you don't control)
OIMIndexComparatorFactory.createAlwaysUpdateComparator<string>()
```

### Slot-backed reads

Indexes store slot references. Entity-by-index reads use `slot.item` directly with no secondary Map lookup per PK. Prefer `entitiesBySetIndexKey` / `entitiesByArrayIndexKey` selectors over `getPksByKey` + manual lookup.

### Cleanup

```typescript
const off = users.updateEventEmitter.subscribeOnKey('u1', handler);
off(); // unsubscribe when done

index.destroy(); // release indexes you no longer need
```
