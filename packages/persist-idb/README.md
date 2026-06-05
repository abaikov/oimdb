# @oimdb/persist-idb

IndexedDB persistence backend for [`@oimdb/persist`](../persist).

Stores snapshots in the browser's IndexedDB — durable, structured-clone based
storage that survives reloads. Useful for:

- **offline-first** apps — keep collections on disk between sessions;
- **client-side caching** — hydrate from disk on startup, refresh in the
  background;
- any browser context needing durable persistence of OIMDB state.

## Install

```bash
npm install @oimdb/persist-idb @oimdb/persist @oimdb/core
```

## Usage

```ts
import { OIMCollection } from '@oimdb/core';
import { createIndexedDbPersistor } from '@oimdb/persist-idb';

type User = { id: string; name: string };

const persistor = createIndexedDbPersistor({ databaseName: 'app' });
const users = new OIMCollection<User, string>();

// records strategy → one IndexedDB row per entity
persistor.collection(users).records({ tableName: 'users' });

users.upsertMany([{ id: 'u1', name: 'Ada' }]);
await persistor.persist();

// later / elsewhere, against the same database
await persistor.hydrate();
```

Object stores (tables) that do not yet exist are created automatically by
bumping the database version, so you never have to declare your schema upfront.

### Strategies

| Builder call | Layout in IndexedDB |
|---|---|
| `.collection(c).entry({ tableName, primaryKey })` | whole snapshot under one key in `tableName` |
| `.collection(c).records({ tableName })` | one row per entity in `tableName` |
| `.collection(c).using(strategy)` | custom strategy |
| `.object(o).entry({ tableName, primaryKey })` | object snapshot under one key |
| `.setIndex(i) / .arrayIndex(i) / .orderedArrayIndex(i)` `.entry({ tableName, primaryKey })` | index snapshot under one key |

### Atomic batch writes

`persist()` collects every dirty resource, opens a **single** readwrite
transaction spanning all of their tables, and writes them together — so a flush
is fully atomic. Built-in strategies (`entry`, `records`) participate in the
batched transaction; a custom strategy passed to `.using()` falls back to its
own sequential write.

### Supplying the IndexedDB factory

In the browser the global `indexedDB` is used automatically. In tests or other
non-browser environments you can pass an explicit factory:

```ts
import { IDBFactory } from 'fake-indexeddb';

const persistor = createIndexedDbPersistor({
    databaseName: 'test-db',
    indexedDb: new IDBFactory(),
});
```

The engine (lifecycle, batching, codecs, source adapters) lives in
[`@oimdb/persist`](../persist); this package only provides the IndexedDB
backend.
