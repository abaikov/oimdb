# @oimdb/exodra

The exoskeleton over your data: OIMDB stays the body — collections, indexes, writes — and this
package straps an [Exodra](https://exodra.org) reactive surface onto it. No React, no hooks, no
re-renders; every read becomes a `TExoBindable` you drop straight into a bucket.

```bash
npm install @oimdb/exodra @oimdb/core
```

It pulls only the **type-only** `@exodra/reactivity-types` — never the reactivity runtime. Your app
already provides `@exodra/reactivity` for `bindable`, `derive`, `h`.

## The whole thing, standing up at once

```ts
import { createOIMCollectionKit, OIMEventQueue } from '@oimdb/core';
import { exoDb } from '@oimdb/exodra';

type User = { id: string; name: string; teamId: string; online: boolean };

const queue = new OIMEventQueue();
const usersKit = createOIMCollectionKit<User, string>(queue, { selectPk: u => u.id });

const byTeam        = usersKit.indexFactory.derivedSetIndex<string>(u => u.teamId);
const byTeamOrdered = usersKit.indexFactory.derivedArrayIndex<string>(u => u.teamId, { orderBy: u => u.name });
const online        = usersKit.indexFactory.derivedSetGlobalIndex({ filter: u => u.online });

export const db = exoDb({
    users: { kit: usersKit, indexes: { byTeam, byTeamOrdered, online } },
    teams: { kit: teamsKit },              // no indexes → byPk / byPks only
});
```

Every index you name becomes a member of the same name, and **the kind of index is inferred from the
index itself** — you never pick a method to match it and never pass the index object again:

```ts
db.users.byPk('u1')                  // TExoBindable<User | undefined>
db.users.byTeam('t1')                // set index      → entities for a key
db.users.byTeamOrdered('t1')         // array index    → same, in order
db.users.online()                    // global index   → no key, and none is asked for
```

Pair it with Exodra's own DI and views never import the database directly:

```ts
export const dbKey = createContextKey<typeof db>('db');   // from @exodra/reactivity
```

## One name per index, everything it can do

```ts
const team = bindable('t1');         // a bindable key — the view follows a moving selection

db.users.byTeam('t1')                         // entities
db.users.byTeam.pks('t1')                     // just the membership
db.users.byTeam.rows('t1', render)            // → bindables.children      (identity-stable)
db.users.byTeamOrdered.list('t1', render)     // → bindableLists.children  (O(delta), fixed key)
db.users.byTeam.subscribe('t1', onChange)     // manual, for onExoMount scope

const live = db.users.byTeam.for(selectedTeam) // pin to a MOVING key…
live.rows(render)                             // …and nothing below takes a key again
```

`rows` and `list` are exactly Exodra's two children buckets:

```ts
const rows = db.users.byTeamOrdered.rows('t1', (user, pk) =>
    h('li', { bindable: { textContent: derive(user, u => u?.name ?? '—') } }),
);
// <ul bindable={{ children: rows }} />
```

Each row gets **its own** entity bindable, so a field edit updates that row in place — the array is
unchanged, the reconcile is a no-op, focus survives. `list` goes further: it derives a command stream
from the ordered index, so a reorder emits `move` and the DOM node is relocated rather than rebuilt.
It exists **only on ordered indexes**, because a set has no order to diff — that is enforced in the
types, not just documented.

`list` takes a plain key only (a bindable there is a compile error): a `TExoBindableList` is bound
once and driven by ops, so following a moving key would mean resetting the whole list on every change
— which is exactly what `rows` already does, better. Use `rows` for a moving selection.

`db.users.kit` stays reachable, so writes and the rest of OIMDB are always one hop away.

## Primitives

The facade is built out of these, and they are exported for everything it does not cover:

```ts
import { exoSource, exoSelector, exoComputed, exoKeyed, exoCombine, exoChildren, exoList } from '@oimdb/exodra';

exoSelector(kit.select.byPk('u1'))              // an OIMSelector
exoComputed(myComputed)                         // an OIMComputed — the aggregation bridge
exoSource(read, subscribe)                      // a raw pair — the escape hatch
exoKeyed(team, k => kit.select.byPks(k))        // a MOVING key

exoCombine([a, b], () => `${a.getValue()} / ${b.getValue()}`)   // Exodra's derive is single-source
exoChildren(tags, { key: t => t.slug, render: renderTag })      // identity-stable, any items
exoList(stream, 'deck-1', renderCard)                           // any command stream
```

Everything is **lazy and ref-counted** (upstream is subscribed only while something downstream is
listening, so cost is O(visible), not O(total)) and **SSR-safe** (`getValue()` reads through to the
store and is valid with no subscription at all — including a reactive key, which resolves on read).

## Patterns

The recipes below cover what real screens actually need. Reach for them before inventing glue.

### An ordered column — order lives in the index, never in the view

```ts
// The index maintains order incrementally; a per-render sort would be O(n log n) on every flush.
const byStatus = tasksKit.indexFactory.derivedArrayIndex(t => t.statusId, {
    orderBy: t => t.createdAt,
});

db.tasks.byStatus.rows('in-progress', renderCard)   // ordered, identity-stable
db.tasks.byStatus.list('in-progress', renderCard)   // same, O(delta) — ordered indexes only
```

### Reading an index — three members, three different promises

```ts
db.tasks.byStatus('s1')                // readonly (Task | undefined)[]  — DEFAULT, holes kept
db.tasks.byStatus.compact('s1')        // readonly Task[]                — filtered, may be SHORTER
db.tasks.byStatus.unsafeDense('s1')    // readonly Task[]                — retyped, nothing checked
```

The default keeps holes because a missing entity is a real state of the store, and hiding it is not
this layer's decision.

`compact` filters them out. Convenient, and it shortens the list — on **manual** pks (`setPks`,
composite indexes) that silently swallows a torn state, which is why it is opt-in.

`unsafeDense` does no filtering and no checking at all: the same array, typed as if there were no
holes. It is correct for a **derived** index, which is dense by construction — every pk in it came
from an entity that exists. It is `unsafe` because that guarantee is yours, not the library's: assert
it wrongly and an `undefined` shows up behind a type that says it cannot.

```ts
// Derived index → dense → assert it once and let the rest of the code be non-null.
const rows = exoChildren(db.tasks.byStatus.unsafeDense('s1'), { key: t => t.id, render: renderCard });
```

### A filtered list — filter in the index by emitting no key

```ts
// Archived tasks never enter the index, so nothing downstream has to skip them.
tasksKit.indexFactory.derivedSetIndex(t => (t.archived ? [] : [t.statusId]));
```

### A row that follows a value from ANOTHER collection

Bind it inside the row: the row is not rebuilt, only that one text node updates.

```ts
const commentRow = (c: Comment) =>
    h('li', {
        bindable: {
            textContent: derive(
                exoSelector(members.select.byPk(c.authorId)),
                m => m?.name ?? '?',
            ),
        },
    });
```

### A row KEY that depends on another collection

When the key itself is derived — a count, a related status — the source must invalidate on that
collection too. `all()` is that change signal.

```ts
const rows = exoChildren(
    exoCombine([db.tasks.all(), db.comments.all()], orderedTasks),
    {
        key: t => `${t.id}:${t.pending ? 1 : 0}:${commentCount(t.id)}`,
        render: renderTaskRow,
    },
);
```

### A `<select>` whose options must not go stale

```ts
const options = derive(db.members.all(), ms =>
    ms.map(m => h('option', { static: { value: m.id } })),
);
```

Reading `collection.getAll()` once at build is the classic staleness bug: rename a member and the
list keeps the old name forever.

### An aggregate — join, count, roll-up

Put the fan-in in ONE `OIMComputed` (leveled at `AFTER_FLUSH`, coherent) and forward it. Do not chain
Exodra `derive`s off each other; Exodra has no glitch batching.

```ts
const openPerAssignee = kit.computed(deps, () => /* … */);
const summary = exoComputed(openPerAssignee);
```

### A selection that moves

Pin the index once; nothing below takes a key again.

```ts
const live = db.tasks.byStatus.for(selectedStatus);
live.rows(renderCard);
```

### A subscription scoped to `onExoMount`

Bucket bindings subscribe at *build*. When you need mount scope, subscribe manually.

```ts
onExoMount: () => { stop = db.tasks.byStatus.subscribe('done', refresh); },
onExoUnmount: () => stop?.(),
```

## No equality options. Anywhere.

There is no options type in this package. Whoever owns the value owns the comparison:

| Source | Where equality lives |
|---|---|
| selectors | `OIMSelector.areEqual` — an element compare in every collection-returning selector |
| computeds | `OIMComputed`'s `compare`, passed at construction |
| `exoCombine` | your own `fn` — return a stable reference when the content is unchanged |
| `exoSource(read, subscribe)` | your own `subscribe` callback — compare there, don't call `onChange` |

Those owners all run *below* the bridge, so a filter here could only reject what they passed, never
resurrect what they dropped. Everything else is forwarded, which is why an in-place entity updater —
whose entity reference is stable — is seen with no configuration at all.

```ts
const theme = exoSource(read, onChange => {
    let last = read();
    return settings.subscribeOnKey('theme', () => {
        const next = read();
        if (Object.is(next, last)) return;
        last = next;
        onChange();
    });
});
```

## Notes

- Multi-entity reads are length-aligned **with holes** (`(TEntity | undefined)[]`), matching
  `@oimdb/react`.
- Row keys must be unique; a duplicate throws rather than silently corrupting an identity-reconciled
  list.
- Fan-in belongs in ONE `OIMComputed` (leveled at `AFTER_FLUSH`, coherent) forwarded via
  `exoSource` — Exodra has no glitch batching, so chaining derives off each other does not.
- The write side is intentionally absent: apps write through orchestration, not from views.

## License

MIT
