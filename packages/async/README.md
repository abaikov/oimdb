# @oimdb/async

Async stores support for OIMDB - async collections and indexes.

## Installation

```bash
npm install @oimdb/async @oimdb/core
```

## Overview

This package provides async versions of collections and indexes that work with asynchronous stores (IndexedDB, async localStorage, remote databases, etc.). All operations return Promises and go directly to the async store without caching.

## Features

- **Async Collections** - `OIMCollectionAsync` and `OIMReactiveCollectionAsync`
- **Async Indexes** - `OIMIndexManualAsync` and `OIMReactiveIndexManualAsync`
- **No cache** - data is not cached in memory, all operations go directly to the store
- **Type-safe** - full TypeScript support
- **Reactive** - supports event system from core package

## Usage

### Async Collection

```typescript
import { OIMCollectionAsync } from '@oimdb/async';
import { IOIMCollectionStoreAsync } from '@oimdb/async';

// Implement your async store
class MyAsyncStore<TEntity, TPk> implements IOIMCollectionStoreAsync<TEntity, TPk> {
    async getOneByPk(pk: TPk): Promise<TEntity | undefined> {
        // Your async implementation
    }
    // ... other methods
}

// Create async collection
const store = new MyAsyncStore<User, string>();
const users = new OIMCollectionAsync<User, string>({ store });

// All operations are async
const user = await users.getOneByPk('user1');
await users.upsertOne({ id: 'user1', name: 'John' });
const allUsers = await users.getAll();
```

### Reactive Async Collection

```typescript
import { OIMReactiveCollectionAsync } from '@oimdb/async';
import { OIMEventQueue, OIMEventQueueSchedulerFactory } from '@oimdb/core';

const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

const users = new OIMReactiveCollectionAsync<User, string>(queue, {
    store: myAsyncStore
});

// Subscribe to updates
users.updateEventEmitter.subscribeOnKey('user1', () => {
    console.log('User1 updated');
});

// Async operations
await users.upsertOne({ id: 'user1', name: 'John' });
```

### Async Index

```typescript
import { OIMIndexManualAsync } from '@oimdb/async';

const index = new OIMIndexManualAsync<string, string>();

// All operations are async
await index.setPks('admin', ['user1', 'user2']);
await index.addPks('admin', ['user3']);
const adminUsers = index.getPksByKey('admin'); // Synchronous read from memory
```

### Reactive Async Index

```typescript
import { OIMReactiveIndexManualAsync } from '@oimdb/async';
import { OIMEventQueue, OIMEventQueueSchedulerFactory } from '@oimdb/core';

const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

const index = new OIMReactiveIndexManualAsync<string, string>(queue);

// Subscribe to updates
index.updateEventEmitter.subscribeOnKey('admin', () => {
    console.log('Admin users changed');
});

// Async operations
await index.setPks('admin', ['user1', 'user2']);
```

## API

### Collections

- `OIMCollectionAsync<TEntity, TPk>` - Basic async collection
- `OIMReactiveCollectionAsync<TEntity, TPk>` - Reactive async collection with events

### Indexes

- `OIMIndexManualAsync<TIndexKey, TPk>` - Manual async index
- `OIMReactiveIndexManualAsync<TIndexKey, TPk>` - Reactive manual async index

### Interfaces

- `IOIMCollectionStoreAsync<TEntity, TPk>` - Interface for async collection stores
- `IOIMIndexStoreAsync<TIndexKey, TPk, TIndex>` - Interface for async index stores

### Types

- `TOIMCollectionOptionsAsync<TEntity, TPk>` - Options for async collections
- `TOIMIndexOptionsAsync<TIndexKey, TPk, TIndex>` - Options for async indexes

## Differences from Core Package

- **All operations are async** - methods return `Promise`
- **No cache** - data is not cached in memory
- **Direct store operations** - all operations go directly to the async store
- **Separate classes** - `OIMCollectionAsync` vs `OIMCollection`, etc.

## Requirements

- `@oimdb/core` ^1.1.0 (peer dependency)

## License

MIT

