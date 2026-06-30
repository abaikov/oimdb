# @oimdb/react

React hooks and context helpers for OIMDB reactive collections, objects, and indexes.

📖 **[Full documentation](https://oimdb.org/)**

## For AI Assistants

If you are an AI assistant, read the full API reference before writing any OIMDB code:

```
node_modules/@oimdb/core/llms.txt
```

CDN fallback: `https://cdn.jsdelivr.net/npm/@oimdb/core/llms.txt`

## Installation

```bash
npm install @oimdb/react @oimdb/core
```

## Model

Collections own entities. Indexes, command streams, and other derived state live next to collections in your application schema.

```typescript
import {
  OIMEventQueue,
  OIMReactiveCollection,
  OIMReactiveCollectionIndexManualSetBased,
} from '@oimdb/core';

type User = {
  id: string;
  teamId: string;
  name: string;
};

const queue = new OIMEventQueue();

const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (user) => user.id,
});

const indexes = {
  usersByTeam: new OIMReactiveCollectionIndexManualSetBased<
    string,
    string,
    User
  >(queue, { collection: users }),
};
```

The React context stores collections only:

```typescript
import { OIMCollectionsProvider } from '@oimdb/react';

const collections = { users };

function App() {
  return (
    <OIMCollectionsProvider collections={collections}>
      <UsersList />
    </OIMCollectionsProvider>
  );
}
```

Keep indexes in your module, app schema, props, or a separate context:

```typescript
import {
  useOIMCollectionsContext,
  useSelectEntitiesByIndexKeySetBased,
} from '@oimdb/react';

type AppCollections = typeof collections;

function TeamUsers({ teamId }: { teamId: string }) {
  const { users } = useOIMCollectionsContext<AppCollections>();

  const teamUsers = useSelectEntitiesByIndexKeySetBased(
    users,
    indexes.usersByTeam,
    teamId
  );

  return (
    <ul>
      {teamUsers?.map((user) =>
        user ? <li key={user.id}>{user.name}</li> : null
      )}
    </ul>
  );
}
```

## Hooks

### Collections

- `useSelectEntityByPk(collection, pk)` watches one entity.
- `useSelectEntitiesByPks(collection, pks)` watches multiple entities.

### Set-Based Indexes

- `useSelectPksByIndexKeySetBased(index, key)` watches PKs for one index key.
- `useSelectPksByIndexKeysSetBased(index, keys)` watches PKs for several index keys.
- `useSelectEntitiesByIndexKeySetBased(collection, index, key)` watches entities referenced by one index key.
- `useSelectEntitiesByIndexKeysSetBased(collection, index, keys)` watches entities referenced by several index keys.

### Array-Based Indexes

- `useSelectPksByIndexKeyArrayBased(index, key)` watches PKs for one index key.
- `useSelectPksByIndexKeysArrayBased(index, keys)` watches PKs for several index keys.
- `useSelectEntitiesByIndexKeyArrayBased(collection, index, key)` watches entities referenced by one index key.
- `useSelectEntitiesByIndexKeysArrayBased(collection, index, keys)` watches entities referenced by several index keys.

### Reactive Objects

- `useSelectValueByObjectKey(object, key)` watches one object key.
- `useSelectValuesByObjectKeys(object, keys)` watches several object keys.

All entity/index hooks return holes as `undefined` (`(TEntity | undefined)[]`), aligned 1:1 with the requested pks/keys — render with a guard (`user ? … : null`).

## Mutable mode + signal hooks (advanced)

The default hooks use `useSyncExternalStore`, which detects change by **reference** (`Object.is`). That requires the store to produce a new entity object per update — the default immutable merge (`{ ...prev, ...draft }`), whose copy is the biggest per-update data-layer cost.

For update-heavy, fine-grained UIs you can run a collection in **in-place / mutable** mode and bind it with the lighter **signal hooks**:

```tsx
import { OIMReactiveCollection, createInPlaceEntityUpdater } from '@oimdb/core';
import {
  useSelectEntityByPkSignal,
  useSelectPksByIndexKeyArrayBasedSignal,
  useSelectPksByIndexKeySetBasedSignal,
} from '@oimdb/react';

// Mutate entities in place — no per-update object allocation.
const cards = new OIMReactiveCollection<Card, string>(queue, {
  selectPk: (c) => c.id,
  updateEntity: createInPlaceEntityUpdater(),
});

// Signal hooks re-render on the keyed notification (no Object.is), so they see
// in-place mutations the default uSES hooks would miss.
const card = useSelectEntityByPkSignal(cards, id);
const ids = useSelectPksByIndexKeyArrayBasedSignal(cardsByDeck, deckId);
```

Available signal hooks (same signatures as their default counterparts): `useSelectEntityByPkSignal`, `useSelectPksByIndexKeyArrayBasedSignal`, `useSelectPksByIndexKeySetBasedSignal`. Compose the fine-grained pattern from them: a parent reads pks by index key, each row reads its own entity by pk.

**Use only when every reader is subscription-driven.** Trade-offs: not Concurrent-Mode tearing-safe; the entity reference is stable across changes, so `React.memo` on entities, prev/next diffing, time-travel, and the default uSES hooks on the same collection won't see updates. Select each entity where you render it (by pk); don't pass mutable entities into `React.memo` children. See [Performance](https://oimdb.org/docs/guides/performance) for when this actually pays off (in plain React the per-component commit usually dominates).

## Context API

```typescript
import {
  OIMCollectionsProvider,
  createOIMCollectionsContext,
  useOIMCollectionsContext,
} from '@oimdb/react';
```

`OIMCollectionsProvider` accepts a dictionary of `OIMReactiveCollection` instances. Use `typeof collections` to preserve exact collection types:

```typescript
const collections = {
  users,
};

type AppCollections = typeof collections;

function UserName({ userId }: { userId: string }) {
  const { users } = useOIMCollectionsContext<AppCollections>();
  const user = useSelectEntityByPk(users, userId);
  return <span>{user?.name}</span>;
}
```
