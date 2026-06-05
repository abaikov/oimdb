# @oimdb/persist-memory

In-memory persistence backend for [`@oimdb/persist`](../persist).

Stores snapshots in plain `Map`s — zero external dependencies. Useful for:

- **tests** — assert what was persisted without touching the DOM;
- **server-side rendering** — fill collections on the server, then dehydrate;
- a reference implementation of a persist backend.

## Install

```bash
npm install @oimdb/persist-memory @oimdb/persist @oimdb/core
```

## Usage

```ts
import { OIMCollection } from '@oimdb/core';
import { createMemoryPersistor } from '@oimdb/persist-memory';

type User = { id: string; name: string };

const persistor = createMemoryPersistor();
const users = new OIMCollection<User, string>();

// records strategy → one Map row per entity
persistor.collection(users).records({ bucketName: 'users' });

users.upsertMany([{ id: 'u1', name: 'Ada' }]);
await persistor.persist();

// later / elsewhere, against the same storage
await persistor.hydrate();
```

### Strategies

| Builder call | Layout in storage |
|---|---|
| `.collection(c).entry({ bucketName })` | whole snapshot under one `entries` key |
| `.collection(c).records({ bucketName })` | one `recordBuckets` Map, one row per entity |
| `.collection(c).using(strategy, codec?)` | custom strategy |
| `.object(o).entry({ bucketName })` | object snapshot under one key |
| `.setIndex(i) / .arrayIndex(i) / .orderedArrayIndex(i)` `.entry()` | index snapshot under one key |

The engine (lifecycle, batching, codecs, source adapters) lives in
[`@oimdb/persist`](../persist); this package only provides the memory backend.
