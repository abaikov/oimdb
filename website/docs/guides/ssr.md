---
sidebar_position: 2
---

# Server-Side Rendering (SSR)

OIMDB has no separate SSR mechanism. **SSR pre-state is just collections that are
already populated before you call `hydrate()`.** The server fills collections from
your data source, serializes them, and the client seeds the *same* collections from
that blob so the first client render matches the server HTML.

The only special part is what happens when a *second*, durable source
(e.g. an IndexedDB cache of the user's local edits) hydrates **after** the SSR
pre-state is already in the collection. Instead of letting that later hydrate
**replace** the pre-state, you reconcile it via the engine's `.onHydrate(reconcile)`
hook.

Transport is provided by [`@oimdb/persist-json`](/docs/packages/persist) — a backend
whose entire storage is one plain JSON-serializable object, so it can be
`JSON.stringify`-ed on the server and read straight back on the client.

```bash
npm install @oimdb/persist-json @oimdb/persist @oimdb/core
```

## The model

1. **Server**: build a per-request store, fill collections, dehydrate to a string,
   inline it into the HTML.
2. **Client phase 1 (sync, before `hydrateRoot`)**: seed the same collections from
   the inlined blob via `createJsonPersistor({ initial })` and `await hydrate()`.
   The collections now hold the server data, so React's first render matches the
   server markup.
3. **Client phase 2 (async, after)**: hydrate a durable persistor (IndexedDB,
   `localStorage`, …) whose resource uses `.onHydrate(...)` to lay local data
   *onto* the SSR pre-state rather than overwriting it.

## Server — fill collections, then dehydrate to a string

Build a fresh store per request (never share collections across requests), fill the
collections from your DB, register them on a JSON persistor under stable storage
keys, `persist()`, then `JSON.stringify` the dump.

```ts
import { OIMCollection } from '@oimdb/core';
import { createJsonPersistor } from '@oimdb/persist-json';

type Question = { id: string; text: string; answer?: string };

const persistor = createJsonPersistor();
const questions = new OIMCollection<Question, string>();

// Register under a stable storage key.
persistor.collection(questions).entry({ storageKey: 'questions' });

// Fill the collection (e.g. from your DB) and snapshot it into storage.
questions.upsertMany([
    { id: 'q1', text: 'What is your name?' },
    { id: 'q2', text: 'What is your quest?' },
]);
await persistor.persist();

// Serialize the whole registered state and inline it into the page.
const json = JSON.stringify(persistor.dehydrate());
const html = `<script>window.__OIM__ = ${json}</script>`;
```

:::warning Escape the inlined blob
A raw `</script>` sequence anywhere inside your data will terminate the inline
`<script>` early. Escape it (replace `<` with `<`) before inlining. If your
snapshots contain `Date`, `Map`, or `Set` values, `JSON.stringify` cannot round-trip
them — use a structured serializer such as
[devalue](https://github.com/Rich-Harris/devalue) and pass the parsed result as
`initial` on the client.
:::

## Client — seed from the inline blob, then hydrate

```ts
import { OIMCollection } from '@oimdb/core';
import { createJsonPersistor } from '@oimdb/persist-json';

const questions = new OIMCollection<Question, string>();

// `initial` is the blob inlined by the server.
const persistor = createJsonPersistor({ initial: window.__OIM__ });

// Register the SAME collections under the SAME keys as the server.
persistor.collection(questions).entry({ storageKey: 'questions' });

// `hydrate()` is synchronous in effect: the blob is already in memory, so the
// collection is populated before you hand off to React `hydrateRoot`.
await persistor.hydrate();

// hydrateRoot(document.getElementById('root')!, <App />);
```

After this `await`, the collections hold exactly the server data, so the first
client render matches the server HTML and React hydration does not warn.

## Worked example — questions from server, answers saved locally

A common scenario: the server ships read-only **questions**, while the user's own
**answers** live in a durable local store (e.g. IndexedDB via
[`@oimdb/persist-idb`](/docs/packages/persist)). Both feed the *same* collection.

The rule is **ordering plus a reconciler**:

1. Hydrate the SSR JSON persistor **first** — the collection now holds the server
   questions (the pre-state).
2. Hydrate the local (durable) persistor **after**, using `.onHydrate(reconcile)`
   so the locally-stored data lays *onto* the SSR pre-state instead of replacing it.
3. Do **not** `start()` autosave on the local persistor until after its hydrate
   completes — otherwise the merge could be written back mid-flight.

The local store should own **only the answer field**. A codec keeps the persisted
shape minimal:

```ts
import { byPk } from '@oimdb/persist'; // from the engine, not the JSON backend

// 1. SSR blob first: questions land in the collection.
const ssr = createJsonPersistor({ initial: window.__OIM__ });
ssr.collection(questions).entry({ storageKey: 'questions' });
await ssr.hydrate();

// 2. Durable local source second, merged onto the SSR pre-state.
//    Here a second JSON persistor stands in for the local backend; in a real
//    app this would be createIndexedDbPersistor(...) from @oimdb/persist-idb.
const local = createJsonPersistor({ initial: window.__ANSWERS__ });
local
    .collection(questions)
    .entry({ storageKey: 'questions' })
    .onHydrate(
        byPk((question, answer) =>
            question ? { ...question, answer: answer.answer } : answer
        )
    );
await local.hydrate();

// 3. Only now is it safe to enable autosave on the local persistor.
local.start();
```

`byPk` walks the union of primary keys and, per pk, calls your resolver with:

- `current` — what is in the collection **now** (the SSR questions);
- `incoming` — what **this** hydrate brings (the locally-stored answers).

So `question ? { ...question, answer: answer.answer } : answer` keeps the server's
question text and overlays the local answer; a key present only locally falls
through to `answer`.

> `byPk` and `.onHydrate` come from `@oimdb/persist` (the engine), not from
> `@oimdb/persist-json`. The JSON package only provides the storage backend and
> `dehydrate()`.

## Conflict policies

The default `hydrate()` behavior (no `.onHydrate` hook) is **replace** — the last
hydrate wins. This is fully backward compatible: code that never registers a hook
behaves exactly as before. For SSR + durable cache you opt into a merge:

- **Per-pk overlay** — `byPk((current, incoming, pk) => …)` lifts a per-entity
  resolver to a whole-collection reconcile. Pick fields from either side per key,
  as in the answers example above.
- **Last-write-wins by version** — keep an `updatedAt` (or monotonic `version`)
  field on the entity and, inside the resolver, return whichever side is newer.
  This mirrors how TanStack Query's `persistQueryClient` reconciles a restored
  cache against fresh data by comparing `dataUpdatedAt`.

A `reconcile(current, incoming) => snapshot` you pass directly to `.onHydrate`
operates on the whole collection snapshot; `byPk` is sugar for the common
per-entity case.

## See also

- [Persist guide](/docs/packages/persist) — backends, codecs, autosave, and the
  hydration merge hook.
