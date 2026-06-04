---
sidebar_position: 5
---

# Redux Adapter

`@oimdb/redux-adapter` bridges OIMDB and Redux. OIMDB stays the source of truth; Redux reads a derived snapshot. Use it for gradual migration or hybrid apps where some state stays in Redux.

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

## How it works

`OIMDBReduxAdapter` wraps your OIMDB collections and indexes, creating standard Redux reducers backed by them. On every `queue.flush()`, it dispatches a single `OIMDB_UPDATE` action — reducers then read current OIMDB state and return the new Redux slice.

```typescript
import { OIMDBReduxAdapter } from '@oimdb/redux-adapter';
import { createStore, combineReducers, applyMiddleware } from 'redux';

const adapter = new OIMDBReduxAdapter(queue);

// Create reducers backed by OIMDB collections/indexes
const usersReducer  = adapter.createCollectionReducer(users.collection);
const byTeamReducer = adapter.createIndexReducer(byTeam);

// Create Redux store with the adapter middleware
const store = createStore(
  combineReducers({
    users:  usersReducer,
    byTeam: byTeamReducer,
    ui:     uiReducer,    // regular Redux reducer, unchanged
  }),
  applyMiddleware(adapter.createMiddleware())
);

// Bind the store so the adapter can dispatch OIMDB_UPDATE
adapter.setStore(store);
```

After this, any OIMDB write automatically flows into Redux state after the next flush:

```typescript
users.collection.upsertOne({ id: 'u1', name: 'Alice', teamId: 'team1' });
await queue.flush();

store.getState().users; // { 'u1': { id: 'u1', name: 'Alice', teamId: 'team1' } }
```

## Default Redux state shape

Collections map to `Record<TPk, TEntity>`. Indexes map to `Record<TKey, TPk[]>` (set-based) or `Record<TKey, TPk[]>` (array-based).

## Custom mapper

Override how OIMDB state maps to Redux state:

```typescript
const usersReducer = adapter.createCollectionReducer(
  users.collection,
  undefined, // no child reducer
  (collection, updatedPks, forceRecompute) => {
    // Build whatever shape you need
    const allUsers = collection.getAll();
    return {
      byId: allUsers,
      ids:  collection.getAllPks(),
      count: collection.countAll(),
    };
  }
);
```

## Child reducer (two-way sync)

A child reducer handles your own Redux actions and writes back into OIMDB. The middleware calls `flushSilently()` after each action so OIMDB state settles before the next render without triggering another `OIMDB_UPDATE`:

```typescript
const usersReducer = adapter.createCollectionReducer(
  users.collection,
  {
    reducer: (state, action) => {
      if (action.type === 'users/setRole') {
        users.collection.upsertOneByPk(action.payload.id, {
          role: action.payload.role,
        });
      }
    },
  }
);
```

## API

| Method | Description |
|---|---|
| `new OIMDBReduxAdapter(queue, opts?)` | Create adapter for the given queue |
| `.createCollectionReducer(collection, child?, mapper?)` | Redux reducer backed by a collection |
| `.createIndexReducer(index, child?, mapper?)` | Redux reducer backed by an index |
| `.createMiddleware()` | Redux middleware — auto-flushes queue after each action |
| `.setStore(store)` | Bind the Redux store (call after `createStore`) |
| `.flushSilently()` | Flush queue without dispatching `OIMDB_UPDATE` |
