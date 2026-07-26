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
import { exoSource, exoSelector, exoComputed, exoKeyed, exoCombine, exoRows, exoList } from '@oimdb/exodra';

exoSelector(kit.select.byPk('u1'))              // an OIMSelector
exoComputed(myComputed)                         // an OIMComputed — the aggregation bridge
exoSource(read, subscribe)                      // a raw pair — the escape hatch
exoKeyed(team, k => kit.select.byPks(k))        // a MOVING key

exoCombine([a, b], () => `${a.getValue()} / ${b.getValue()}`)   // Exodra's derive is single-source
exoRows(tagSlugs, renderTag)                                    // identity-stable rows
exoList(stream, 'deck-1', renderCard)                           // any command stream
```

Everything is **lazy and ref-counted** (upstream is subscribed only while something downstream is
listening, so cost is O(visible), not O(total)) and **SSR-safe** (`getValue()` reads through to the
store and is valid with no subscription at all — including a reactive key, which resolves on read).

## Patterns

Three situations cover essentially every screen. Find yours before inventing glue.

### 1. Render entities of a collection or an index

Identity already exists — it is the primary key. Feed the pks in; there is no key function anywhere.

```ts
// From an index (ordered, filtered — see below):
const rows = db.tasks.byStatus.rows('in-progress', (task, pk) =>
    h('li', { bindable: { textContent: derive(task, t => t?.title ?? '') } }),
);
// <ul bindable={{ children: rows }} />

// Or straight from the primitive, over any pk sequence:
const rows = exoRows(db.tasks.byStatus.pks('in-progress'), pk => renderCard(pk));

// Whole collection rather than an index:
const rows = exoRows(db.tasks.allPks(), pk => renderCard(pk));
```

The row is built once per pk. A field edit updates that row's own bindables in place — the array is
unchanged, the reconcile is a no-op, focus survives.

**Never put state in the key.** `` `${t.id}:${commentCount(t.id)}` `` turns "which row is this" into
"which row and in what condition": the row is rebuilt every time the condition changes, and its
focus goes with it. Measured on 2000 rows, one added comment cost 2.44 ms and a wasted rebuild that
way, versus 0.73 ms and zero rebuilds with the count bound inside the row.

### The canonical shape: a post, its comments, and the comments themselves

Three independent sources of change, three independent subscriptions — each reaching exactly the node
that depends on it:

```ts
const postView = (postId: string) => {
    const post = db.posts.byPk(postId);                       // 1. the post itself

    const comments = db.comments.byPost.rows(postId, (comment, pk) =>
        h('li', {                                              // 3. each comment, its own bindable
            bindable: { textContent: derive(comment, c => c?.body ?? '') },
        }),
    );                                                         // 2. membership, from the index

    return h('article', {
        bindable: {
            textContent: derive(post, p => p?.title ?? ''),
        },
    }, h('ul', { bindable: { children: comments } }));
};
```

What happens on each change:

| Change | What fires |
| --- | --- |
| the post is edited | the post's binding only — the comment list is not touched |
| one comment is edited | that row's binding only — the list array comes back **identical**, no reconcile, no rebuild |
| a comment is added or removed | the list rebuilds, and only the genuinely new row is rendered; surviving rows keep their identity |

No composite key, no combining, no extra invalidation wiring: the index gives membership, `byPk` gives
each row its own value, and the post is its own binding. `exo-post-comments.test.ts` asserts every
line of that table with counters.

Spelled out with the primitive instead of the facade, it is the same thing:

```ts
const comments = exoRows(db.comments.byPost.pks(postId), pk =>
    h('li', { bindable: { textContent: derive(db.comments.byPk(pk), c => c?.body ?? '') } }),
);
```

### A LIST of posts, each with its own comments (nested rows)

`exoRows` inside `exoRows`. The post row is built once and cached, so the comment list created inside
it is cached with it — adding a post does not rebuild anybody else's comments.

```ts
const posts = exoRows(db.posts.postsByDate.pks(), postPk => {
    const post = db.posts.byPk(postPk);

    const comments = exoRows(db.comments.byPost.pks(postPk), commentPk =>
        h('li', {
            bindable: {
                textContent: derive(db.comments.byPk(commentPk), c => c?.body ?? ''),
            },
        }),
    );

    return h('article', {
        bindable: { textContent: derive(post, p => p?.title ?? '') },
    }, h('ul', { bindable: { children: comments } }));
});
// <section bindable={{ children: posts }} />
```

Containment, asserted in `exo-post-list.test.ts`:

| Change | What happens |
| --- | --- |
| a post's title | that post's binding only — neither list moves |
| a comment's body | that comment's binding only — its list returns the identical array |
| a comment added to post A | **only A's** comment list rebuilds, and only the new comment renders; post B and the post list are untouched |
| a post added | the post list rebuilds and only the new post renders; existing rows keep their identity **and their already-built comment lists** |
| a post removed | its row and nested list are dropped; nothing else re-renders |

That last row is the point of caching by identity: the nested list is part of the cached row, so it
survives changes to the outer list instead of being rebuilt with it.

Through the facade it collapses to a single top-level call — the inner list is just an expression
inside the row's markup, the way `.map()` is inside JSX:

```ts
const posts = db.posts.postsByDate.rows((post, postPk) =>
    h('article', {
        bindable: { textContent: derive(post, p => p?.title ?? '') },
    },
        h('ul', {
            bindable: {
                children: db.comments.byPost.rows(postPk, comment =>
                    h('li', { bindable: { textContent: derive(comment, c => c?.body ?? '') } }),
                ),
            },
        }),
    ),
);
```

Two lists means two identity sequences and therefore two children buckets — that is the floor, not a
limitation of this package. The only way to a literally single map is flattening to one key sequence
(`['p:p1','c:c1','p:p2',…]`), which buys a flat DOM at the price of prefixed keys and, more
importantly, of containment: the sequence then has to be recomputed whenever ANY post's comments
change.


### 2. A row needs data from another table

Bind it inside the row. Do not join, do not widen the key.

```ts
const commentRow = (pk: string) =>
    h('li', {
        bindable: {
            // the author's name follows the members collection…
            textContent: derive(exoSelector(members.select.byPk(authorOf(pk))), m => m?.name ?? '?'),
            // …and a count follows the comments index
            title: derive(db.comments.byTask.pks(pk), c => `${c.length} comments`),
        },
    });
```

Need a genuine aggregate — a roll-up, a total, something that is one value rather than a per-row
one? That is one `OIMComputed` (leveled at `AFTER_FLUSH`, coherent) forwarded with `exoComputed`.

There is deliberately **no multi-source derived table**. A joined row would need a primary key
nobody references, and an identity nobody uses is not an identity. If something *does* reference the
combined thing, it is a real entity — give it its own collection and fill it yourself.

### 3. Items that are not entities

Tags, groups, buckets — anything without a collection. They still have something stable to be keyed
by, so pass those keys:

```ts
const rows = exoRows(tagSlugs, slug => renderTag(slug));
```

### Ordering and filtering live in the index

```ts
// order is maintained incrementally; a per-render sort would be O(n log n) every flush
kit.indexFactory.derivedArrayIndex(t => t.statusId, { orderBy: t => t.createdAt });

// filtered: emit no key and the entity never enters the index
kit.indexFactory.derivedSetIndex(t => (t.archived ? [] : [t.statusId]));
```

### A selection that moves

Pin the index once; nothing below takes a key again.

```ts
const live = db.tasks.byStatus.for(selectedStatus);
live.rows(renderCard);
```

### A `<select>` whose options must not go stale

```ts
const options = derive(db.members.all(), ms =>
    ms.map(m => h('option', { static: { value: m.id } })),
);
```

Reading `collection.getAll()` once at build is the classic staleness bug.

### A subscription scoped to `onExoMount`

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
