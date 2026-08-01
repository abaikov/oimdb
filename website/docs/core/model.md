---
sidebar_position: 1
---

# Core Model

OIMDB's current app-level model is:

- a shared `OIMEventQueue`
- a collection model created with `createOIMCollectionKit`
- indexes that live next to the collection
- selectors for reactive reads

Collections remain the source of truth for entities. Indexes and ordered lists keep canonical collection slots, but they are not stored inside the collection.

## Collection Model

```typescript
import {
  createOIMCollectionKit,
  OIMEventQueue,
  OIMEventQueueSchedulerFactory,
} from '@oimdb/core';

type User = {
  id: string;
  name: string;
  teamId: string;
};

const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask(),
});

const users = createOIMCollectionKit<User, string>(queue, {
  selectPk: (user) => user.id,
});
```

The model facade contains:

```typescript
type TOIMCollectionKit<TEntity, TPk> = {
  queue: OIMEventQueue;
  collection: OIMReactiveCollection<TEntity, TPk>;
  indexFactory: OIMCollectionIndexFactory<TEntity, TPk>;
  select: OIMCollectionSelectors<TEntity, TPk>;
};
```

## Slot-Returning Writes

Collection writes return canonical slots. Updating an entity keeps the same slot object and updates `slot.item`.

```typescript
const firstSlot = users.collection.upsertOne({
  id: 'u1',
  name: 'Alice',
  teamId: 'team1',
});

const updatedSlot = users.collection.upsertOneByPk('u1', {
  name: 'Alicia',
});

console.log(firstSlot === updatedSlot); // true
```

This is what lets collection-bound indexes store stable slot references while still exposing PK projections such as `getPksByKey`.

## Event Semantics

**Batching & coalescing** — multiple writes to the same key coalesce into a single notification per `queue.flush()`. Delivery is driven by updated key sets, not by every write.

**Reentrancy — the frame is closed to writes.** A *frame* is one indivisible reporting cycle: `queue.flush()` drains its tasks, then effects and computeds run. Writing to a store anywhere inside it throws `updates during queue.flush() are not allowed` — from a subscription callback during the drain and from an effect's `run()` alike.

The rule is not a scheduling limitation. It is a statement about what a store write *means*. A write says **new input arrived**: a server response, a user action, a timer. Data computed *from* what the store already holds is not input, it is derivation — and derivation belongs to `OIMComputed`, which the queue orders topologically and resolves within the same frame. Code that writes during a frame is deriving with the wrong tool: it is using a collection as a place to stash a value that a computed should have produced. That code has a defect regardless of whether the engine tolerates it, and the tolerant version is the worse one — a derivation laundered through a store loses its ordering guarantees, lands a frame late, and an effect that writes to its own dependency simply reschedules itself forever. OIMDB refuses the write instead, at the first attempt, with the store named in the message.

Because nothing can mutate while a frame runs, the frame has a second property: **it can report what changed.** Each carrier — an entity slot, an index bucket — holds its change record for as long as the frame lasts, so a subscriber can ask *which* fields or keys moved rather than only that something did, at the moment it is told that something did.

The record is deliberately frame-scoped. It describes one cycle; keeping it beyond that cycle would mean an ever-growing log that every writer pays for and almost no reader wants. Concretely, the carrier's dirty flag is cleared once the frame ends, and the detail behind it is overwritten by the next frame's first write — so it is valid to read during delivery and meaningless afterwards.

That is also why **notifications carry no payload**. A keyed handler is `() => void`. Nothing is allocated per delivery, per subscriber, or per changed key — no diff object, no key array, no event record. A write marks its carrier; whoever is interested reads the carrier during the frame. The alternative — handing every subscriber a description of what changed — allocates on the hottest path in the library, on behalf of the many subscribers that only want to re-read and re-render.

Effects read; they do not write. To act on a frame, do it after `flush()` returns.

A computed publishing its own value during the effect phase is not a store write and is unaffected — that is how a chain of computeds resolves inside a single frame.

**Single-pass flush** — `queue.flush()` runs each currently-pending task once (buffer swap, no re-drain loop). Tasks enqueued *during* a flush land in a fresh buffer and run on the next flush (scheduled tick or next manual `flush()`), not within the same call.

**Key-scoped subscriptions** — there is no "subscribe to everything". Delivery cost is proportional to the subscriber sets for changed keys only.

## Missing entities: the holes policy

A pk can point at nothing — an entity was never upserted, or was removed while some index or caller
still holds its pk. OIMDB has one rule for that across the whole library:

> **Reads are length-aligned and surface the gap as `undefined`. Dropping it is always a separate,
> explicitly named call.**

A missing entity is a real state of the store, not noise. Hiding it turns a torn state into a list
that is quietly one item short — the kind of bug that shows up far from its cause.

```ts
collection.getManyByPks(['u1', 'gone', 'u2']);
// → [User, undefined, User]     length-aligned, the gap is visible

collection.getManyByPksCompact(['u1', 'gone', 'u2']);
// → [User, User]                filtered, SHORTER than the input — deliberate
```

The same contract holds everywhere entities come back as a list:

| Read | Shape |
| --- | --- |
| `collection.getManyByPks(pks)` | `(TEntity \| undefined)[]` |
| `collection.getManyByPksCompact(pks)` | `TEntity[]`, may be shorter |
| `index.getEntitiesByKey(key)` | `(TEntity \| undefined)[]` |
| `globalIndex.getEntities()` | `(TEntity \| undefined)[]` |
| every selector returning a list | `readonly (TEntity \| undefined)[]` |
| `stream.getEntitiesByKey(key)` | `(TEntity \| undefined)[]` |

### When holes cannot happen

A **derived** index is dense by construction: every pk in it was put there by an entity that exists,
and removal maintains it. Reading through one, the `| undefined` is spurious — but it is still the
honest type, because the store cannot know where your pks came from.

A **manual** index (`arrayBasedIndex`, `composite*Index`, anything written with `setPks`) holds pks
you wrote by hand. There a gap is entirely possible, and compacting it away is how a torn state
becomes invisible.

So: compact when the pks are dense and you know it; otherwise keep the alignment and handle the gap.
`@oimdb/exodra` mirrors this exactly — the default index read keeps holes, `.compact(key)` filters,
and `.unsafeDense(key)` only changes the type while checking nothing, named so the assertion is
visibly yours.

## Composite primary key

A collection's PK is usually a primitive (`string`/`number`). It can instead be a **composite key path** — an arbitrary-length tuple of primitive segments, e.g. `[userId, projectId]`. Pass a trie-backed store:

```typescript
import { OIMReactiveCollection, OIMCollectionStoreTrieDriven } from '@oimdb/core';

const memberships = new OIMReactiveCollection<Membership, readonly (string | number)[]>(
  queue,
  {
    selectPk: (m) => [m.userId, m.projectId],
    store: new OIMCollectionStoreTrieDriven<Membership>(),
  }
);

memberships.getOneByPk([1, 10]);       // matched by content — a fresh array is fine
memberships.subscribeOnKey([1, 10], render);
memberships.removeOneByPk([1, 10]);
```

Declaring the segment order twice — once in `selectPk`, once at every lookup — is a convention the
compiler cannot check: with same-typed segments a swapped pair reads a different bucket in silence.
`ctk` (create tuple key) pins the order in one place and both sides derive from it:

```typescript
import { ctk } from '@oimdb/core'; // ctk — create tuple key

type TMembershipKeys = { userId: number; projectId: number };
const membershipKey = ctk<TMembershipKeys>()(['userId', 'projectId']);

const memberships = new OIMReactiveCollection<Membership, TOIMKeyPath>(queue, {
  selectPk: (m) => membershipKey(m),   // the entity carries those fields
  store: new OIMCollectionStoreTrieDriven<Membership>(),
});

memberships.getOneByPk(membershipKey({ userId: 1, projectId: 10 }));
```

A renamed or missing segment is now a compile error, and the order at the call site is irrelevant. It
is parameterised by the KEY type rather than the entity, so every segment is already a `TOIMPk` and
the projection needs no type assertion; an entity satisfies that shape structurally. `create`
allocates one small array — call it where the fields change, not on every read.

Key paths are matched **by content** (a freshly built `[1, 10]` resolves to the same entity as one stored earlier); the store interns each logical PK to one canonical `slot.pk` reference. Primitive-PK collections keep the native-`Map` store (`OIMCollectionStoreMapDriven`) untouched — no cost.

Indexes work over a composite-PK collection too — `indexFactory.setBasedIndex()` indexes composite PKs, matching them by content in `setPks`/`addPks`/`removePks`.

**Serialization** (Redux, persist, snapshots) keys by a string, so a composite PK there needs an `IOIMPkCodec` (`OIMPkCodecKeyPath` is the ready one). `@oimdb/persist` and `@oimdb/snapshot-manager` store the PK as a value and need no codec; `@oimdb/redux-adapter` keys state by string and takes the codec (see its docs).
