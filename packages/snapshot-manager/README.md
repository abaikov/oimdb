# @oimdb/snapshot-manager

Snapshot manager for OIMDB collections. Tracks changes across multiple collections and provides consolidated snapshots of all modifications.

📖 **[Full documentation](https://oimdb.org/)**

## Features

- 📸 **Snapshot Management**: Captures changes across multiple collections
- 🔄 **Direct Subscription**: Subscribes directly to collection events (bypasses coalescing)
- 🧹 **Auto Cleanup**: Automatically clears state after each snapshot
- 🏷️ **Type Safe**: Full TypeScript support with generic collections
- ⚡ **Performance**: Efficient deduplication using Sets

## Installation

```bash
npm install @oimdb/snapshot-manager
```

## Usage

```typescript
import { OIMSnapshotManager } from '@oimdb/snapshot-manager';

// Define your collections
const collections = {
  users: userCollection,
  posts: postCollection,
  comments: commentCollection
};

// Create snapshot manager
const snapshotManager = new OIMSnapshotManager(collections);

// Let changes happen...
// userCollection.upsertOne({...});
// postCollection.upsertOneByPk(1, {...});
// commentCollection.removeOneByPk(5);

// Take snapshot
const snapshot = snapshotManager.takeSnapshot();
// Returns:
// {
//   users: [{ pk: 1, entity: {...} }],
//   posts: [{ pk: 1, entity: {...} }], 
//   comments: [{ pk: 5, entity: null }] // null = deleted
// }

// Clean up when done
snapshotManager.destroy();
```

## API

### `OIMSnapshotManager<TCollections>`

#### Constructor
- `new OIMSnapshotManager(collections, options?)` - Creates manager and subscribes to collection events.
  - `options.includeEmptyCollections?: boolean` (default `true`) - include collections with no recorded changes as empty arrays in the snapshot.

#### Methods
- `takeSnapshot()` - Returns snapshot of all changes and **clears internal state** (each snapshot is the delta since the previous one).
- `destroy()` - Unsubscribes from all events

#### Types
- `SnapshotManagerOptions` - Constructor options (`includeEmptyCollections`)
- `SnapshotData<T>` - Type for snapshot results
- `EntitySnapshot<TEntity, TPk>` - Individual entity snapshot
