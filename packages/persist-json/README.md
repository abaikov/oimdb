# @oimdb/persist-json

JSON-dump persistence backend for [`@oimdb/persist`](../persist) — the SSR
dehydrate/hydrate transport.

Storage is a single plain, JSON-serializable object whose keys are the
per-resource `storageKey`s. That means the whole registered state can be
`JSON.stringify`-ed on the server, inlined into the HTML, and fed straight back
into the same collections on the client. There is no I/O, no batching, no path —
it is the simplest possible backend.

## Install

```bash
npm install @oimdb/persist-json @oimdb/persist @oimdb/core
```

## SSR recipe

### Server — fill collections, then dehydrate to a string

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

### Client — seed from the inline blob, then hydrate

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
```

## Merging SSR with a durable local cache (the key scenario)

A common case: the server ships read-only **questions**, while the user's own
**answers** live in a durable local store (e.g. IndexedDB via
[`@oimdb/persist-idb`](../persist-idb)). Both feed the *same* collection. The
rule is ordering plus a reconciler:

1. Hydrate the SSR JSON persistor **first** — the collection now holds the
   server questions.
2. Hydrate the local (durable) persistor **after**, using the engine's
   `.onHydrate(reconcile)` hook so the locally-stored data lays *onto* the SSR
   pre-state instead of replacing it.
3. Do **not** `start()` autosave on the local persistor until after its hydrate
   completes — otherwise the merge could be written back mid-flight.

```ts
import { byPk } from '@oimdb/persist'; // from the engine, not this package

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

So `question ? { ...question, answer: answer.answer } : answer` keeps the
server's question text and overlays the local answer; a key present only locally
falls through to `answer`.

> `byPk` and `.onHydrate` come from `@oimdb/persist` (the engine), not from this
> package. This package only provides the JSON storage backend and `dehydrate()`.

## API

| Member | Purpose |
|---|---|
| `createJsonPersistor({ initial? })` | Create a persistor; `initial` seeds storage from an SSR blob. |
| `.collection(c).entry({ storageKey }, codec?)` | Persist a collection snapshot under one key. |
| `.collection(c).using(strategy, codec?)` | Persist a collection with a custom strategy. |
| `.object(o).entry({ storageKey })` | Persist an object snapshot under one key. |
| `.setIndex(i) / .arrayIndex(i) / .orderedArrayIndex(i)` `.entry({ storageKey })` | Persist an index snapshot under one key. |
| `persistor.dehydrate()` | Return the JSON-serializable dump of everything persisted. |

The engine (lifecycle, batching, codecs, reconcilers, source adapters) lives in
[`@oimdb/persist`](../persist); this package only provides the JSON backend.
