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

db.users.byTeam(team)                        // entities
db.users.byTeam.pks(team)                     // just the membership
db.users.byTeam.rows(team, render)            // → bindables.children      (identity-stable)
db.users.byTeamOrdered.list(team, render)     // → bindableLists.children  (O(delta))
db.users.byTeam.subscribe('t1', onChange)     // manual, for onExoMount scope
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

`db.users.kit` stays reachable, so writes and the rest of OIMDB are always one hop away.

## Primitives

The facade is built out of these, and they are exported for everything it does not cover:

```ts
import { exoBindable, exoCombine, exoChildren, exoList } from '@oimdb/exodra';

exoBindable(kit.select.byPk('u1'))              // an OIMSelector
exoBindable(myComputed)                         // an OIMComputed
exoBindable(read, subscribe)                    // a raw pair — the escape hatch
exoBindable(team, k => kit.select.byPks(k))     // a reactive key

exoCombine([a, b], () => `${a.getValue()} / ${b.getValue()}`)   // Exodra's derive is single-source
exoChildren(tags, { key: t => t.slug, render: renderTag })      // identity-stable, any items
exoList(stream, 'deck-1', renderCard)                           // any command stream
```

Everything is **lazy and ref-counted** (upstream is subscribed only while something downstream is
listening, so cost is O(visible), not O(total)) and **SSR-safe** (`getValue()` reads through to the
store and is valid with no subscription at all — including a reactive key, which resolves on read).

## No equality options. Anywhere.

There is no options type in this package. Whoever owns the value owns the comparison:

| Source | Where equality lives |
|---|---|
| selectors | `OIMSelector.areEqual` — an element compare in every collection-returning selector |
| computeds | `OIMComputed`'s `compare`, passed at construction |
| `exoCombine` | your own `fn` — return a stable reference when the content is unchanged |
| `exoBindable(read, subscribe)` | your own `subscribe` callback — compare there, don't call `onChange` |

Those owners all run *below* the bridge, so a filter here could only reject what they passed, never
resurrect what they dropped. Everything else is forwarded, which is why an in-place entity updater —
whose entity reference is stable — is seen with no configuration at all.

```ts
const theme = exoBindable(read, onChange => {
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
  `exoBindable` — Exodra has no glitch batching, so chaining derives off each other does not.
- The write side is intentionally absent: apps write through orchestration, not from views.

## License

MIT
