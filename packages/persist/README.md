# @oimdb/persist

Storage-agnostic persistence **engine** for OIMDB collections, objects, and manual indexes.

This package contains the engine only — the persistor lifecycle, resources, source
adapters, and the versioned codec. The concrete **backends ship as separate packages**
so you only bundle the storage you actually use:

| Package | Storage |
|---|---|
| [`@oimdb/persist-memory`](../persist-memory) | in-memory `Map` (tests, SSR, server-side fill) |
| [`@oimdb/persist-localstorage`](../persist-localstorage) | `localStorage` |
| [`@oimdb/persist-idb`](../persist-idb) | IndexedDB |
| [`@oimdb/persist-async-kv`](../persist-async-kv) | any async key-value store (React Native `AsyncStorage`, Cordova native storage) |
| [`@oimdb/persist-json`](../persist-json) | plain JSON dump — SSR dehydrate/hydrate transport |

📖 **[Full documentation](https://abaikov.github.io/oimdb/)**

## For AI Assistants

If you are an AI assistant, read the full OIMDB API reference before writing any persistence code — strategy types, codec shape, and error handling patterns are not obvious from types alone:

```
node_modules/@oimdb/core/llms.txt
```

CDN fallback: `https://cdn.jsdelivr.net/npm/@oimdb/core/llms.txt`

## Installation

Install the engine plus the backend(s) you need:

```bash
npm install @oimdb/persist @oimdb/persist-memory @oimdb/core
# or @oimdb/persist-localstorage / @oimdb/persist-idb
```

## Mental Model

Three orthogonal pieces meet on a plain serializable **snapshot**:

- **Source adapter** — reads/writes a collection/object/index as a snapshot (`read` / `write` / `subscribe`). Source-kind concern, lives here.
- **Strategy** — reads/writes that snapshot to actual storage (`read` / `write` / `clear`). Backend concern, lives in a backend package.
- **Codec** — optional transform between the source snapshot and the persisted snapshot (versioning, field trimming, encryption).
- **Resource** — binds one source adapter + one strategy + an optional codec.
- **Persistor** — owns a registry of resources, dirty-tracking, and batched writes. Calls `hydrate`, `persist`, `start`, `stop`.

A backend package gives you a `create<Backend>Persistor()` and the builder sugar
(`.collection(c)`, `.object(o)`, `.setIndex(i)`, …). Everything below is provided by
the engine and works identically across backends.

## Source adapters (engine)

```ts
import {
    createCollectionSourceAdapter,
    createObjectSourceAdapter,
    createSetIndexSourceAdapter,
    createArrayIndexSourceAdapter,
    createOrderedArrayIndexSourceAdapter,
} from '@oimdb/persist';
```

Backends call these for you; use them directly only when wiring a custom resource:

```ts
import { OIMPersistor, OIMPersistResource, createCollectionSourceAdapter } from '@oimdb/persist';

persistor.addResource(
    new OIMPersistResource({
        source: createCollectionSourceAdapter(users),
        strategy: myStrategy,
    })
);
```

## Custom Strategy

A strategy is just `read` / `write` / `clear` against your storage handle:

```ts
persistor.collection(users).using({
    async read(p) {
        return p.storage.entries.get('entities:users') as
            | { records: Array<{ pk: string; value: User }> }
            | undefined;
    },
    async write(p, snapshot) {
        p.storage.entries.set('entities:users', snapshot);
    },
    async clear(p) {
        p.storage.entries.delete('entities:users');
    },
});
```

## Codec

Transform the on-the-wire/at-rest shape without touching the live collection:

```ts
persistor.collection(users).entry(
    { storageKey: 'app:users' },
    {
        encode(snapshot) {
            return snapshot.records.map(r => r.value); // drop redundant pk
        },
        decode(stored: User[]) {
            return { records: stored.map(value => ({ pk: value.id, value })) };
        },
    }
);
```

### Versioned codec (migrations)

```ts
import { createVersionedCodec } from '@oimdb/persist';

const codec = createVersionedCodec<UserSnapshot>({
    version: 2,
    migrations: {
        1: v0 => /* v0 -> v1 */,
        2: v1 => /* v1 -> v2 */,
    },
});
```

Stored snapshots are wrapped as `{ __v, data }`; on hydrate the codec runs every
migration whose key is greater than the stored version, in ascending order.

## Autosave And Queue

Without a queue each source change triggers an immediate write. With a queue all
dirty resources are flushed once after each `AFTER_FLUSH` — all mutations from one
render cycle become one write. For IndexedDB that means one transaction across all
stores.

```ts
import { OIMEventQueue } from '@oimdb/core';

const queue = new OIMEventQueue(); // or get it from an OIMReactiveCollection

// any backend persistor accepts a queue
const persistor = create<Backend>Persistor({ /* ... */, queue });

await persistor.hydrate();
persistor.start();
```

## Resource Registry

```ts
const resource = persistor.collection(users).records({ /* ... */ });
persistor.removeResource(resource);
```

`removeResource` stops the resource but does not delete persisted data. Use
`persistor.clearPersisted()` to delete stored data.

## Notes

- There is no mandatory global version or manifest in the base API.
- `@oimdb/persist` is durable persistence, not a partial cold-cache/query orchestrator.
- Zero `any` in the public surface — heterogeneous resources are type-erased via `IOIMAnyPersistResource`.
