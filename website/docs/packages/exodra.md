---
sidebar_position: 7
---

# Exodra

`@oimdb/exodra` adapts OIMDB into [Exodra](https://exodra.org) reactivity. It is the Exodra
counterpart of [`@oimdb/react`](/docs/packages/react): where the React package turns an OIMDB source
into a hook + re-render, this one turns it into a read-only Exodra **bindable** (`TExoBindable`).
No React, no hooks, no re-renders.

```bash
npm install @oimdb/exodra @oimdb/core
```

The bridge pulls only the **type-only** `@exodra/reactivity-types` (never the reactivity runtime),
and its single peer dependency is `@oimdb/core`. Your Exodra app already provides `@exodra/reactivity`
for the runtime bits (`bindable`, `derive`, `h`) used at the call sites below.

## Why

An Exodra view binds reactive values into DOM buckets (`bindable`, `bindableList`). Feeding those
from OIMDB otherwise means hand-writing, on every page:

```ts
onExoMount: () => { stop = index.subscribeOnKey(key, () => bind.setValue(read())); }
onExoUnmount: () => stop?.();
```

`@oimdb/exodra` collapses that into a single adapter over OIMDB's selector layer. The fine-grained
subscription (the index key for membership **and** each pk in the set, re-subscribing when the set
changes) already lives in the `@oimdb/core` selectors; this package just adapts `OIMSelector`
`{ getValue, watch }` → Exodra `{ getValue, subscribe }`.

Every bindable it produces is **read-only**, **lazy** (it subscribes upstream only while it has a
downstream subscriber, so cost is O(visible) not O(total)) and **SSR-safe** (`getValue()` reads
fresh from the store and is valid without an active subscription).

## Core adapter

```typescript
import { fromSelector, fromOimdb } from '@oimdb/exodra';

// Primary: wrap any OIMSelector.
const alice = fromSelector(kit.select.byPk('u1')); // TExoBindable<User | undefined>

// Escape hatch for anything without a selector — a raw read/subscribe pair.
const theme = fromOimdb(
  () => settings.get('theme'),
  (onChange) => settings.subscribeOnKey('theme', onChange),
);
```

Options (`{ equals?, alwaysNotify? }`): `equals` suppresses empty emits (defaults to `Object.is`);
`alwaysNotify: true` forwards every change — use it with in-place entity updaters, where the entity
reference is stable and `Object.is` would otherwise swallow the update.

## Selectors → bindables

`bindSelectors` mirrors `OIMCollectionSelectors` (the same selectors the React hooks use) into
bindable-returning methods. Every key argument also accepts a bindable, so a view follows a moving
selection without being recreated.

```typescript
import { bindSelectors, combine } from '@oimdb/exodra';
import { bindable, derive, h } from '@exodra/reactivity';

const bound = bindSelectors(kit.select);

// one entity
const neuron = bound.byPk(neuronId);
// <span bindable={{ textContent: derive(neuron, (n) => n?.name ?? '—') }} />

// entities by index key, with a REACTIVE key
const selectedApp = bindable('app-1');
const neurons = bound.entitiesBySetIndexKey(db.neurons.indexes.appId, selectedApp);
// setValue on selectedApp re-points the subscription — no component recreation

// combine — Exodra's derive is single-source; this is the multi-source escape hatch
const label = combine([neuron, neurons], () =>
  `${neuron.getValue()?.name} (${neurons.getValue().length})`,
);
```

Methods mirror the selectors: `byPk`, `byPks`, `entitiesBySetIndexKey`, `entitiesByArrayIndexKey`,
`entitiesByCompositeSetIndexKey`, `entitiesByCompositeArrayIndexKey`, `entitiesByArrayGlobalIndex`,
`entitiesBySetGlobalIndex`. Single-entity readers yield `TEntity | undefined`; multi readers yield
`readonly (TEntity | undefined)[]` (length-aligned with holes, matching `@oimdb/react`).

:::note
`bindSelectors` takes the `OIMCollectionSelectors` instance (`kit.select`), not a bare collection,
because a collection's event queue is private and the selectors own a queue-bound compute runtime.
:::

## Computed

```typescript
import { fromComputed } from '@oimdb/exodra';

const total = fromComputed(myComputed); // OIMComputed<T> → TExoBindable<T>
```

Keep any fan-in inside a single `OIMComputed` and forward its final value — do not chain several
Exodra `derive`s off each other, as Exodra has no glitch-batching across derived chains.

## Identity-stable lists

Exodra's `list()` is op-based with no key function; identity comes from caching a row's schema by a
stable key. `keyedChildren` / `entityRows` do exactly that — a field edit that does not change the
key set is a reconcile no-op (the row's own inner bindable updates in place, so focus survives),
while membership or order changes rebuild the array.

```typescript
import { entityRows } from '@oimdb/exodra';
import { h, derive } from '@exodra/reactivity';

const order = bound.entitiesByArrayIndexKey(db.neurons.indexes.appId, selectedApp);
// map ordered entities → their pks for the row source, or use an ordered pk bindable directly

const rows = entityRows(
  orderedPks,                       // TExoBindable<readonly TPk[]>
  (pk) => bound.byPk(pk),           // each row gets its own entity bindable
  (entity, pk) =>
    h('li', { bindable: { textContent: derive(entity, (n) => n?.name ?? '—') } }),
);
// <ul bindable={{ children: rows }} />
```

### O(delta) command-stream path

For large ordered lists, drive an Exodra `bindableList` from an OIMDB ordered-list command stream so
that only moved, inserted or removed rows touch the DOM. The stream's position-addressed commands map
1:1 onto Exodra `TExoListOp`.

```typescript
import { listFromCommandStream } from '@oimdb/exodra';
import { createOIMOrderedListCommandStreamDiffDriven } from '@oimdb/core';

const cardsByDeck = cards.indexFactory.derivedArrayIndex((c) => c.deckId, {
  orderBy: (c) => c.position,
});
const stream = createOIMOrderedListCommandStreamDiffDriven(queue, cardsByDeck);

const list = listFromCommandStream(stream, 'deck-1', (slot) => renderCardRow(slot.pk));
// <ul bindableList={{ children: list }} />
```

A diff-driven stream emits `move` (not remove+insert) on reorders, so Exodra relocates the existing
DOM node and the row keeps its state. `snapshot()` reads the current order synchronously (SSR-safe);
the stream is subscribed only while the list has an ops subscriber.

## Low-level (find-replace migration)

These six mirror a typical inline `oimdb-bind.ts` 1:1 (same names, same signatures), so migrating an
app is only an import-path change. They also serve `onExoMount`-scoped subscriptions (page-scoped
instances) — where a bucket binding, which subscribes at *build* time, is not what you want.

```typescript
import {
  readEntityByPk, subscribeEntityByPk,
  readPksByIndexKey, subscribePksByIndexKey,
  readEntitiesByIndexKey, subscribeEntitiesByIndexKey, // fine-grained, not a firehose
} from '@oimdb/exodra';
```

## See also

- [React package](/docs/packages/react) — the `useSyncExternalStore` twin of this adapter
- [Indexes and Selectors](/docs/core/indexes-selectors) — the selector layer this bridge wraps
