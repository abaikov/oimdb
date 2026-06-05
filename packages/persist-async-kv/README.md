# @oimdb/persist-async-kv

Asynchronous key-value persistence backend for
[`@oimdb/persist`](../persist) — the async twin of
[`@oimdb/persist-localstorage`](../persist-localstorage).

Serializes snapshots to strings (JSON by default) and stores them through any
object implementing the small async `TOIMAsyncKVLike` interface. Primary
consumers:

- **React Native** — `AsyncStorage` drops in directly;
- **Cordova native storage** — via a thin adapter around a callback-based
  plugin.

## Install

```bash
npm install @oimdb/persist-async-kv @oimdb/persist @oimdb/core
```

## Usage

```ts
import { OIMCollection } from '@oimdb/core';
import { createAsyncKVPersistor } from '@oimdb/persist-async-kv';

type User = { id: string; name: string };

// `storage` is required — there is no global default like `localStorage`.
const persistor = createAsyncKVPersistor({ storage });
const users = new OIMCollection<User, string>();

// whole snapshot under one key
persistor.collection(users).entry({ storageKey: 'app:users' });

users.upsertOne({ id: 'u1', name: 'Ada' });
await persistor.persist();

// later / elsewhere, against the same storage
await persistor.hydrate();
```

`storage` is any object implementing `TOIMAsyncKVLike`. Supply your own codec
when needed:

```ts
const persistor = createAsyncKVPersistor({
    storage, // TOIMAsyncKVLike
    serialize: (v) => JSON.stringify(v),
    deserialize: (v) => JSON.parse(v),
});
```

### React Native (AsyncStorage)

`AsyncStorage` already matches `TOIMAsyncKVLike`, including the `multiGet` /
`multiSet` batch operations used to coalesce writes:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncKVPersistor } from '@oimdb/persist-async-kv';

const persistor = createAsyncKVPersistor({ storage: AsyncStorage });
```

### Cordova (native storage)

Wrap a callback-based native plugin (e.g. `cordova-plugin-nativestorage`) into
`TOIMAsyncKVLike` by returning Promises from the three core operations:

```ts
import { TOIMAsyncKVLike } from '@oimdb/persist-async-kv';

const storage: TOIMAsyncKVLike = {
    getItem: (key) =>
        new Promise((resolve, reject) =>
            NativeStorage.getItem(
                key,
                (value) => resolve(value ?? null),
                (err) => (err?.code === 2 ? resolve(null) : reject(err))
            )
        ),
    setItem: (key, value) =>
        new Promise((resolve, reject) =>
            NativeStorage.setItem(key, value, () => resolve(), reject)
        ),
    removeItem: (key) =>
        new Promise((resolve, reject) =>
            NativeStorage.remove(key, () => resolve(), reject)
        ),
};

const persistor = createAsyncKVPersistor({ storage });
```

Cordova webviews also already support
[`@oimdb/persist-localstorage`](../persist-localstorage) and
[`@oimdb/persist-idb`](../persist-idb), so this package is mainly for React
Native and Cordova *native* storage.

### Strategies

| Builder call | Layout in storage |
|---|---|
| `.entry({ storageKey })` | whole snapshot under one `storageKey` |
| `.path({ storageKey, path })` | snapshot nested at `path` inside the `storageKey` root object |
| `.using(strategy)` | custom strategy (collection builder only) |

`.entry({ storageKey })` writes the snapshot to a dedicated key.

`.path({ storageKey, path })` writes the snapshot into a nested location of a
shared root object. Multiple `.path` strategies that share the same root
`storageKey` — or several `.entry` resources whose keys are written together —
are merged and batched into a **single** `multiSet` (or sequential writes when
the storage has no batch ops) per batch persist. This keeps several
collections / objects / indices under one application key without redundant
writes.

`.using(strategy)` registers a fully custom `TOIMPersistStrategy`. Custom
strategies are written sequentially (they do not participate in the batched
single-write optimization unless they implement `TOIMAsyncKVBatchStrategy`).

The engine (lifecycle, batching, codecs, source adapters) lives in
[`@oimdb/persist`](../persist); this package only provides the async key-value
backend.
