# @oimdb/persist-localstorage

localStorage persistence backend for [`@oimdb/persist`](../persist).

Serializes snapshots to strings (JSON by default) and stores them in the
browser's `localStorage` — or any object implementing the small
`TOIMLocalStorageLike` interface (handy for tests and SSR).

## Install

```bash
npm install @oimdb/persist-localstorage @oimdb/persist @oimdb/core
```

## Usage

```ts
import { OIMCollection } from '@oimdb/core';
import { createLocalStoragePersistor } from '@oimdb/persist-localstorage';

type User = { id: string; name: string };

const persistor = createLocalStoragePersistor();
const users = new OIMCollection<User, string>();

// whole snapshot under one localStorage key
persistor.collection(users).entry({ storageKey: 'app:users' });

users.upsertOne({ id: 'u1', name: 'Ada' });
await persistor.persist();

// later / elsewhere, against the same storage
await persistor.hydrate();
```

By default the persistor uses `globalThis.localStorage`. Supply your own
storage and codec when needed:

```ts
const persistor = createLocalStoragePersistor({
    storage: myStorage, // TOIMLocalStorageLike
    serialize: (v) => JSON.stringify(v),
    deserialize: (v) => JSON.parse(v),
});
```

### Strategies

| Builder call | Layout in storage |
|---|---|
| `.entry({ storageKey })` | whole snapshot under one `storageKey` |
| `.path({ storageKey, path })` | snapshot nested at `path` inside the `storageKey` root object |
| `.using(strategy)` | custom strategy (collection builder only) |

`.entry({ storageKey })` writes the snapshot to a dedicated key.

`.path({ storageKey, path })` writes the snapshot into a nested location of a
shared root object. Multiple `.path` strategies that share the same root
`storageKey` are merged and produce a **single** `localStorage` write per
batch persist — so you can keep several collections / objects / indices under
one application key without redundant writes.

`.using(strategy)` registers a fully custom `TOIMPersistStrategy`. Custom
strategies are written sequentially (they do not participate in the batched
single-write optimization unless they implement `TOIMLocalStorageBatchStrategy`).

The engine (lifecycle, batching, codecs, source adapters) lives in
[`@oimdb/persist`](../persist); this package only provides the localStorage
backend.
