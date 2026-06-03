# @oimdb/react

React hooks and context helpers for OIMDB reactive collections, objects, and indexes.

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
