# @oimdb/snapshot-manager

Snapshot manager for OIMDB collections. Tracks changes across multiple collections and provides consolidated snapshots of all modifications.

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
// userCollection.create({...});
// postCollection.updateByPk(1, {...});
// commentCollection.deleteByPk(5);

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
- `new OIMSnapshotManager(collections)` - Creates manager and subscribes to collection events

#### Methods
- `takeSnapshot()` - Returns snapshot of all changes and clears internal state
- `destroy()` - Unsubscribes from all events

#### Types
- `SnapshotData<T>` - Type for snapshot results
- `EntitySnapshot<TEntity, TPk>` - Individual entity snapshot
