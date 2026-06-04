---
sidebar_position: 6
---

# Snapshot Manager

`@oimdb/snapshot-manager` tracks which entities changed across multiple collections and delivers a consolidated snapshot on demand.

```bash
npm install @oimdb/snapshot-manager @oimdb/core
```

## Use case

You need to sync changes to a server, implement undo/redo, or audit what changed after a batch of operations. Instead of diffing the whole store, `OIMSnapshotManager` listens directly to collection events and accumulates changed PKs. When you call `takeSnapshot()`, you get only what changed — and the tracker resets.

## Basic usage

```typescript
import { OIMSnapshotManager } from '@oimdb/snapshot-manager';

const manager = new OIMSnapshotManager({
  users: users.collection,
  tasks: tasks.collection,
});

// ... make changes to collections ...
users.collection.upsertOne({ id: 'u1', name: 'Alice', teamId: 'team1' });
tasks.collection.upsertOne({ id: 't1', title: 'Fix bug', assigneeId: 'u1' });

// Take snapshot — returns changed entities and clears the tracker
const snapshot = manager.takeSnapshot();

// snapshot.users: [{ pk: 'u1', entity: { id: 'u1', name: 'Alice', teamId: 'team1' } }]
// snapshot.tasks: [{ pk: 't1', entity: { id: 't1', title: 'Fix bug', assigneeId: 'u1' } }]

// Deleted entity: entity is null
users.collection.removeOneByPk('u1');
const s2 = manager.takeSnapshot();
// s2.users: [{ pk: 'u1', entity: null }]
```

## Sync to server after each flush

```typescript
queue.emitter.on('afterFlush', async () => {
  if (!manager.hasChanges()) return;

  const snapshot = manager.takeSnapshot();
  await api.patch('/sync', snapshot);
});
```

## API

| Method | Description |
|---|---|
| `new OIMSnapshotManager(collections, opts?)` | Start tracking the given collections |
| `.takeSnapshot()` | Return all changed entities since last snapshot, reset tracker |
| `.hasChanges()` | `true` if any changes are pending |
| `.getChangeCount()` | `{ [collectionName]: number }` — pending changes per collection |
| `.clearChanges()` | Reset tracker without taking a snapshot |
| `.destroy()` | Unsubscribe and release resources |

### Options

| Option | Default | Description |
|---|---|---|
| `includeEmptyCollections` | `true` | Include collections with no changes in the snapshot (empty array) |

## Notes

- Subscribes to raw collection events, **bypassing queue coalescing**. Multiple writes to the same PK within one flush are collapsed to one snapshot entry — but the snapshot always reflects the final entity state at the time of `takeSnapshot()`.
- `takeSnapshot()` is not tied to `queue.flush()`. Call it whenever you need a snapshot — after a flush, on a timer, on user action.
