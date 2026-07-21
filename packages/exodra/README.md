# @oimdb/exodra

Exodra integration for OIMDB. The counterpart of [`@oimdb/react`](../react): where the React
package turns an OIMDB source into a hook + re-render, this one turns it into a read-only
[Exodra](https://exodra.org) **bindable** (`TExoBindable`). No React, no hooks, no re-renders.

Peer dependencies: `@exodra/reactivity` and `@oimdb/core` only.

## Why

An Exodra view binds reactive values into DOM buckets (`bindable`, `bindableList`). To feed those
from OIMDB you otherwise hand-write, on every page:

```ts
onExoMount: () => { stop = index.subscribeOnKey(key, () => bind.setValue(read())); }
onExoUnmount: () => stop?.();
```

`@oimdb/exodra` collapses that to a single adapter over OIMDB's selector layer, plus thin typed
wrappers. The fine-grained subscription (index key for membership **and** each pk in the set,
re-subscribing when the set changes) already lives in `@oimdb/core` selectors — this package just
adapts `OIMSelector` `{ getValue, watch }` → Exodra `{ getValue, subscribe }`.

## Core adapter

```ts
import { fromSelector, fromOimdb } from '@oimdb/exodra';

// Primary: wrap any OIMSelector. Lazy + ref-counted (subscribes upstream only while it has a
// downstream subscriber → cost O(visible)); getValue() reads fresh, so it is SSR/string-render safe.
const alice = fromSelector(kit.select.byPk('u1')); // TExoBindable<User | undefined>

// Escape hatch for anything without a selector (a raw read/subscribe pair).
const custom = fromOimdb(
    () => obj.get('theme'),
    onChange => obj.subscribeOnKey('theme', onChange),
);
```

`equals` suppresses empty emits; `alwaysNotify: true` forwards every change (use with in-place entity
updaters, where the entity reference is stable and the default `Object.is` would swallow the update).

## Hook-mirror selectors → bindables

`bindSelectors` mirrors `OIMCollectionSelectors` (the `@oimdb/react` selectors) into
bindable-returning methods. Every key argument also accepts a bindable, so a view follows a moving
selection without being recreated.

```ts
import { bindSelectors, combine } from '@oimdb/exodra';
import { bindable, derive } from '@exodra/reactivity';

const bound = bindSelectors(kit.select);

const neuron = bound.byPk(neuronId);
// <span bindable={{ textContent: derive(neuron, n => n?.name ?? '—') }} />

const selectedApp = bindable('app-1');
const neurons = bound.entitiesBySetIndexKey(db.neurons.indexes.appId, selectedApp);
// changing selectedApp re-points the subscription; no component recreation

// combine — Exodra's derive is single-source; this is the multi-source escape hatch
const label = combine([neuron, neurons], () => `${neuron.getValue()?.name} (${neurons.getValue().length})`);
```

Available methods mirror the selectors: `byPk`, `byPks`, `entitiesBySetIndexKey`,
`entitiesByArrayIndexKey`, `entitiesByCompositeSetIndexKey`, `entitiesByCompositeArrayIndexKey`,
`entitiesByArrayGlobalIndex`, `entitiesBySetGlobalIndex`.

## Computed

```ts
import { fromComputed } from '@oimdb/exodra';

const total = fromComputed(myComputed); // OIMComputed<T> → TExoBindable<T>
```

Keep fan-in inside one `OIMComputed` and forward its final value — do not chain several Exodra
`derive`s off each other, as Exodra has no glitch-batching across derived chains.

## Identity-stable lists

Exodra's `list()` is op-based with no key function; identity comes from caching a row's schema by a
stable key. `keyedChildren` / `entityRows` do exactly that: a field edit that doesn't change the key
set is a reconcile no-op (the row's own inner bindable updates in place, focus survives), while
membership/order changes rebuild the array.

```ts
import { entityRows } from '@oimdb/exodra';
import { h, derive } from '@exodra/reactivity';

const order = bound... // an ordered pk bindable
const rows = entityRows(
    order,
    pk => bound.byPk(pk),
    (entity, pk) => h('li', { bindable: { textContent: derive(entity, n => n?.name ?? '—') } }),
);
// <ul bindable={{ children: rows }} />
```

### O(delta) command-stream path

For large ordered lists, drive an Exodra `bindableList` from an OIMDB ordered-list command stream —
only moved/inserted/removed rows touch the DOM. The stream's commands map 1:1 onto `TExoListOp`.

```ts
import { listFromCommandStream } from '@oimdb/exodra';
import { createOIMOrderedListCommandStreamDiffDriven } from '@oimdb/core';

const cardsByDeck = cards.indexFactory.derivedArrayIndex(c => c.deckId, { orderBy: c => c.position });
const stream = createOIMOrderedListCommandStreamDiffDriven(queue, cardsByDeck);

const list = listFromCommandStream(stream, 'deck-1', slot => renderCardRow(slot.pk));
// <ul bindableList={{ children: list }} />
```

A diff-driven stream emits `move` (not remove+insert) on reorders, so Exodra relocates the existing
DOM node and the row keeps its state.

## Low-level (find-replace migration)

The six functions below mirror a typical inline `oimdb-bind.ts` 1:1 (same names, same signatures),
so migrating an app is only an import-path change. They also serve `onExoMount`-scoped subscriptions
(page-scoped instances), where a bucket binding — which subscribes at *build* — is not what you want.

```ts
readEntityByPk, subscribeEntityByPk,
readPksByIndexKey, subscribePksByIndexKey,
readEntitiesByIndexKey, subscribeEntitiesByIndexKey // fine-grained, not a firehose
```

## License

MIT
