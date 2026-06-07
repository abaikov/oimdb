---
sidebar_position: 4
---

# React

`@oimdb/react` provides hooks and a context provider. All hooks use `useSyncExternalStore` and re-render only when the specific data they watch actually changes.

```bash
npm install @oimdb/react @oimdb/core
```

## Setup

Create your store outside React, then pass collections through a Provider:

```typescript
// store.ts
import { createOIMCollectionKit, OIMEventQueue, OIMEventQueueSchedulerFactory } from '@oimdb/core';

const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask(),
});

const users = createOIMCollectionKit<User, string>(queue, {
  selectPk: (u) => u.id,
});
const tasks = createOIMCollectionKit<Task, string>(queue, {
  selectPk: (t) => t.id,
});

export const byTeam  = users.indexFactory.derivedSetIndex((u) => u.teamId);
export const byStatus = tasks.indexFactory.derivedSetIndex((t) => t.status);

export const collections = {
  users: users.collection,
  tasks: tasks.collection,
};
```

```tsx
// App.tsx
import { OIMCollectionsProvider } from '@oimdb/react';
import { collections } from './store';

export function App() {
  return (
    <OIMCollectionsProvider collections={collections}>
      <TeamList teamId="team1" />
    </OIMCollectionsProvider>
  );
}
```

## Hooks

Access collections via `useOIMCollectionsContext`, then pass them to hooks:

```tsx
import { useOIMCollectionsContext, useSelectEntitiesByIndexKeySetBased, useSelectEntityByPk } from '@oimdb/react';
import { byTeam } from './store';

type AppCollections = typeof collections;

function TeamList({ teamId }: { teamId: string }) {
  const { users } = useOIMCollectionsContext<AppCollections>();
  const members = useSelectEntitiesByIndexKeySetBased(users, byTeam, teamId);

  return <ul>{members?.map(u => u && <li key={u.id}>{u.name}</li>)}</ul>;
}

function UserCard({ userId }: { userId: string }) {
  const { users } = useOIMCollectionsContext<AppCollections>();
  const user = useSelectEntityByPk(users, userId);

  return <span>{user?.name ?? '—'}</span>;
}
```

### Collection hooks

| Hook | Returns |
|---|---|
| `useSelectEntityByPk(collection, pk)` | `TEntity \| undefined` |
| `useSelectEntitiesByPks(collection, pks)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeySetBased(collection, index, key)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeysSetBased(collection, index, keys)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeyArrayBased(collection, index, key)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeysArrayBased(collection, index, keys)` | `(TEntity \| undefined)[]` |

### Index-only hooks (PKs without entities)

| Hook | Returns |
|---|---|
| `useSelectPksByIndexKeySetBased(index, key)` | `Set<TPk>` |
| `useSelectPksByIndexKeysSetBased(index, keys)` | `TPk[]` (flattened) |
| `useSelectPksByIndexKeyArrayBased(index, key)` | `TPk[]` |
| `useSelectPksByIndexKeysArrayBased(index, keys)` | `TPk[]` (flattened) |

### Object hooks

For `OIMReactiveObject` (settings, flags, single values):

| Hook | Returns |
|---|---|
| `useSelectValueByObjectKey(obj, key)` | `TValue \| undefined` |
| `useSelectValuesByObjectKeys(obj, keys)` | `(TValue \| undefined)[]` |

## Signal hooks + mutable collections (advanced)

The default hooks use `useSyncExternalStore`, which detects change by **reference** (`Object.is`). That requires the store to produce a new entity object per update — the default immutable merge (`{ ...prev, ...draft }`), whose copy is the biggest per-update data-layer cost.

For update-heavy workloads you can run a collection in **mutable / in-place** mode and bind it with the lighter **signal hooks**:

```tsx
import { OIMReactiveCollection, createInPlaceEntityUpdater } from '@oimdb/core';
import { useSelectEntityByPkSignal, useSelectPksByIndexKeyArrayBasedSignal } from '@oimdb/react';

// Mutate entities in place — no per-update object allocation.
const cards = new OIMReactiveCollection(queue, {
  selectPk: c => c.id,
  updateEntity: createInPlaceEntityUpdater(),
});

// Signal hooks re-render on the keyed notification (no Object.is), so they see
// in-place mutations that the default uSES hooks would miss.
const card = useSelectEntityByPkSignal(cards, id);
const ids  = useSelectPksByIndexKeyArrayBasedSignal(cardsByDeck, deckId);
```

Available signal hooks (same signatures as their default counterparts):

| Hook | Returns |
|---|---|
| `useSelectEntityByPkSignal(collection, pk)` | `TEntity \| undefined` |
| `useSelectPksByIndexKeyArrayBasedSignal(index, key)` | `readonly TPk[]` |
| `useSelectPksByIndexKeySetBasedSignal(index, key)` | `ReadonlySet<TPk>` |

These three cover the fine-grained pattern: a parent reads pks by index key, each row reads its own entity by pk. (Entity-by-pk for the row + pks-by-index for the list — no signal variants exist for the `*Keys` plural or entities-by-index hooks; compose from these.)

This drops both the merge copy and the uSES overhead — the per-update work MobX also avoids. It pays off where the data layer is the bottleneck (very fine-grained renderers, large update-heavy lists); in plain React the per-component commit usually dominates, so the win is small.

**Use only when every reader is subscription-driven**, and mind the trade-offs:

| | Default hooks | `*Signal` hooks + in-place |
|---|---|---|
| Change detection | reference (`Object.is`) | keyed notification |
| Per-update allocation | new entity object | none (in place) |
| Concurrent Mode | tearing-safe | **not** tearing-safe |
| Reference identity | stable per change | **stable across changes** — breaks `React.memo` on entities, prev/next diffing, time-travel, and the immutable-only consumers (e.g. the default uSES hooks on the same collection) |

Select each entity where you render it (by pk); don't pass mutable entities into `React.memo` children expecting them to re-render.

## Multiple contexts

If you have multiple independent app sections, create separate typed contexts instead of sharing the global one:

```tsx
import { createOIMCollectionsContext, OIMCollectionsProvider, useOIMCollectionsContext } from '@oimdb/react';

const AdminContext = createOIMCollectionsContext<{ users: typeof users.collection }>();

function AdminPanel() {
  return (
    <OIMCollectionsProvider collections={{ users: users.collection }} context={AdminContext}>
      <AdminContent />
    </OIMCollectionsProvider>
  );
}

function AdminContent() {
  const { users } = useOIMCollectionsContext(AdminContext);
  // ...
}
```
