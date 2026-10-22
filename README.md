# OIMDB — powerful state, native speed

State management for applications that outgrew a basic store. Everything such an app
ends up writing by hand ships in the box, and it costs close to what a hand-written
implementation on plain `Map`s and arrays would.

- **Signals.** Computed values and effects over a dependency graph: a derivation is
  recomputed on the read that asks for it, and only if something it reads changed.
- **Granularity.** Subscribe to one entity, one column of an entity, one group, or a
  group's column. A write wakes only the subscribers of what it changed, and however many
  writes land before a flush, each subscriber is woken once.
- **Memory management.** Entities, groups and derived values that nothing holds or
  watches are released under a policy you pick: at the last give-back, after idle time,
  after a write, or never. General-purpose stores keep everything you put in them until
  you delete it yourself.
- **Collections.** Every entity stored once, indexes that file it by a column, ordered
  lists that record what moved, sorted views that re-sort only when a sort column changes.
- **Performance.** Measured in [`packages/bench`](packages/bench/) on the same tasks as other
  state libraries and against a hand-written floor; where a trade-off has two sides, both
  ship as strategies and you pick one at construction.

Built for boards, feeds, chats and tables.

## 📦 Packages

OIMDB is a monorepo of separate packages:

### [@oimdb/core](packages/core/) - Core Library
The engine: identities, collections, indexes, the compute graph, and the frame.

> **Not on npm at these versions.** The local versions are `@oimdb/core` 4.0.0,
> `@oimdb/react` 3.0.0 and `@oimdb/redux-adapter` 3.0.0; the registry has 3.12.1,
> 2.2.0 and 2.2.0. That is a different, key-addressed engine, which the benchmark measures
> separately as `oimdb-legacy`. An `npm install` of any of them does not fail; it
> silently installs that engine. The code here is available only through this
> workspace, so build it from this repository.

**Key Features:**
- **One copy of every entity.** Stored once by key; a key is resolved to its slot
  once, and every later read, write and subscription skips the lookup
- **A write wakes only what it changed.** Its subscribers, and no one else on the page
- **Groups kept for you.** An index files each entity by a field and moves it when
  that field changes; a hand-filled bucket keeps exactly the order it was given
- **Sorts that run only when they must.** A sorted view over an index re-sorts only
  when its membership or one of its sort columns changed
- **Derived values that are asked, never woken.** A computed value is recomputed
  when read, and only if something it reads has changed
- **Batching built in.** Writes accumulate, and `db.flush()` delivers each change once,
  however many writes landed
- **Memory that cleans itself up.** What nothing uses is released by a policy you choose
- **Typed end to end.** No `any` anywhere in the public surface

[📖 See @oimdb/core documentation](packages/core/README.md)

### [@oimdb/react](packages/react/) - React Integration
React hooks for OIMDB reactive collections.

There is no install command for it. `npm install @oimdb/react @oimdb/core` resolves
to `2.2.0` and `3.12.1`, the key-addressed engine that the benchmark measures under
the name `oimdb-legacy`. The install does not fail, but it gives you a different
engine. Use the workspace.

**Key Features:**
- One binding, `useOIMValue`, built on `useSyncExternalStore`. A subscription in the
  core is one `OIMEffectService.INSTANCE.subscribeEffect(db, roots, computeds, body)`, so one hook covers all of it
- `useOIMEntity`, `useOIMField`, `useOIMBucketSlots`, `useOIMBucketSlotsByKey` — resolve-once sugar over
  that binding
- Only the `OIMDB` is passed through context (`OIMDBProvider`), not a dictionary of
  collections; the effect service is stateless
- Field-level subscriptions, so an unrelated write to the same entity costs a comparison
  instead of a render

[📖 See @oimdb/react documentation](packages/react/README.md)

### [@oimdb/redux-adapter](packages/redux-adapter/) - Redux Integration
A production-ready Redux adapter for migrating from Redux to OIMDB gradually, or for running both side by side.

There is no install command here either, for the same reason: `@oimdb/redux-adapter` on
npm is `2.2.0`, built against the key-addressed engine.

**Key Features:**
- **🔄 Two-Way Synchronization**: reducers read a derived snapshot of OIMDB; a child
  reducer can write back into it
- **⚡ One dispatch per frame**: `OIMDB_UPDATE` is dispatched once per frame, and only
  when something the adapter watches has changed, never once per entity
- **⚡ Automatic Flushing**: the bundled middleware flushes the runtime after every
  action, so a child reducer's writes settle without a second dispatch
- **🎯 Flexible State Mapping**: RTK-Entity-Adapter-shaped defaults, or your own mapper

**Perfect for:**
- Migrating from Redux to OIMDB incrementally
- Using OIMDB for complex relational data alongside Redux
- Replacing Redux entirely while staying compatible

[📖 See @oimdb/redux-adapter documentation](packages/redux-adapter/README.md)

## ✨ Quick Example

```typescript
import {
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMEntityService,
    type TOIMBucketSlotsSetStore,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';

type TUser = { id: string; name: string; team: string };
type TUserSlot = TOIMEntitySlot<TUser>;

// The db owns the clock, the collector slot and the default channel slot.
const db = new OIMDB();

// A service holds no data: it is the doors. A store slot is one population of it,
// and it carries the channel it was made on.
const userService = createOIMEntityService<TUser>(db, { keyOf: (user) => user.id });
const users = userService.createStoreSlot(db);

// A bucket service and one store slot of it: buckets of user slots, under a key.
const teamService = createOIMBucketService<
    TUserSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TUserSlot>, OIMSlotContentBucketServiceSetDriven<TUserSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TUserSlot>() });
const byTeam = teamService.createStoreSlot(db);

// Reads and slot doors are on the service; writes are on its slotContentService.
userService.slotContentService.upsertEntities(users, [
    { id: 'u1', name: 'Ann', team: 'core' },
    { id: 'u2', name: 'Bob', team: 'core' },
]);

// Resolve the bucket ONCE through the hold door, and keep what you get back.
const core = teamService.holdSlotByKey(byTeam, 'core');
const watching = OIMEffectService.INSTANCE.createEffect(db, [core], [], () => {
    console.log('core now has', teamService.slotContentService.getBucketMemberSlotCount(core), 'people');
});

// A BUCKET'S SLOTS ARE WRITTEN. Nothing reads `team` and files a member for you.
teamService.slotContentService.writeBucketMemberSlots(
    core, [userService.getSlotByKey(users, 'u1'), userService.getSlotByKey(users, 'u2')],
);
db.flush();   // → core now has 2 people

// A write moves columns and stops there. Moving Bob out of the team is two
// statements: the write, and the slots you decide follow from it.
userService.slotContentService.updateEntity(userService.getSlotByKey(users, 'u2'), { team: 'design' });
teamService.slotContentService.writeBucketMemberSlots(core, [userService.getSlotByKey(users, 'u1')]);
db.flush();   // → core now has 1 people

// Renaming puts no slot in and takes none out, so the bucket never hears about it.
userService.slotContentService.updateEntity(userService.getSlotByKey(users, 'u1'), { name: 'Ann B.' });
db.flush();   // → nothing

OIMEffectService.INSTANCE.disposeEffect(watching);   // stop listening
core.owner.unholdSlot(core);      // give the hold back when you are done with the bucket
```

`createOIMEntityService` and `createOIMBucketService` are the convenience form. The
entity one wraps the base layer, `createOIMSlotCollectionService({ slotContentService:
createOIMSlotContentEntityService(db, { keyOf }) })`, and takes the same options.

A bucket that fills itself from a column is the other strategy: an index service
(`createOIMIndexService`). Manual is the default because a bucket's slots are
a fact about the **response** a caller is composing, and no column can express absence.

## 🎯 Key Benefits

- **🚀 Performance First**: pay the lookup where a relationship is formed, never where
  it is used. That is why there is no by-key write door: a write is
  `slotContentService.updateEntity(slot, …)`, and a caller holding only a key writes
  `updateEntity(entityService.getSlotByKey(storeSlot, key), …)`, so the map read is explicit.
- **📡 Reactive Architecture**: one notification per identity per frame, however many
  writes landed on it
- **🔧 Type Safety**: no `any` in the public surface. Pairing a bucket service with a
  bucket whose storage type it does not hold, or naming a sort column the entity does not
  have, is a compile error. There is no `ordered` flag: a bucket service whose
  positions you write by hand is one built over `OIMSlotContentBucketServiceArrayDriven`
- **🏗️ Modular**: slot stores, entity writers and bucket content services are orthogonal
  interfaces, so you pair whichever you need at construction: a map-driven store for one
  scalar key and a tree-driven one for a chain, and three bucket content services

## 🚀 Getting Started

For detailed documentation and API reference, visit the individual package READMEs:

- **[@oimdb/core](packages/core/README.md)** - Complete core library documentation
- **[@oimdb/react](packages/react/README.md)** - React integration guide
- **[@oimdb/redux-adapter](packages/redux-adapter/README.md)** - Redux migration and integration guide

## 🧪 Development

```bash
# Install dependencies
npm install

# The whole gate, in one command: lint, then type-check, then tests, then build.
# Run this before calling anything done — the three below are its parts, and
# `npm test` on its own type-checks nothing (see the note under it).
npm run verify

# Run tests
npm test

# Type-check every workspace, TEST FILES INCLUDED. Jest transpiles under
# `isolatedModules`, so `npm test` above type-checks nothing; this is the only
# command that does. CI runs it before the tests for the same reason.
npm --workspaces --if-present run type-check

# Build every workspace
npm --workspaces --if-present run build

# Compare against other libraries (mobx, jotai, tinybase, ...). The OIMDB adapter
# in packages/bench imports the current core; the key-addressed engine's adapter
# sits beside it as `oimdb-legacy`. Runs land in packages/bench/results/.
npm run bench

# Build packages
npm run build
```

## 📚 Documentation

Full documentation is published at **[oimdb.org](https://oimdb.org/)**.

Source docs live in [`website/docs/`](website/docs/).

## 🤝 Contributing

OIMDB is designed to be modular and extensible. Contributions are welcome.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/abaikov/oimdb/issues)

---

**OIMDB** — entities, lists and sorts that keep themselves in sync.
