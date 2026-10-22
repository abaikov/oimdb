# @oimdb/core

The engine behind OIMDB: a wide toolkit at close to native cost. It gives you
signals (computed values and effects that recompute only when what they read has changed),
granular subscriptions (an entity, a column, a group, a group's column), memory management
(whatever nothing holds or watches is released under a policy you pick, which
general-purpose stores leave to you), entities by key, groups that stay up to date from a
column or are filled by hand, sorted views, and one delivery mechanism, the **frame**, that
connects all of it.

---

## Why OIMDB

**Take it when the application works with collections** (entities with ids that show
up in more than one place) and you do not want to build the machinery for them by
hand. Without it, teams give up and refetch, keep the store in a component's state
where it cannot be moved or reused, use a query cache that holds one copy of an
entity per query, or use a bare store and write the collection layer on top.

On a bare store such as zustand, that layer is yours:

1. a group index (`idsByDeck`) maintained in every action that can move an entity;
2. a re-sort of the whole group on every write, including one that changed a title;
3. a copy of the whole table per write, because the store compares by reference;
4. every `set` calling every listener, so one entity's write runs every mounted
   selector;
5. batching, as a second bulk action;
6. selectors that must return stable values (`?? []` re-renders on every write);
7. memory: a group nobody shows keeps its entities forever, unless you count references.

Here the index files entities by `keyOf`, a bucket keeps the order it was given, and a
sorted list over an index re-sorts only when its membership or one of its columns moves.
A write changes a slot in place and wakes only what moved, the frame batches, and a
bucket or an entity that nobody refers to goes under the release policy you picked.

**Why this shape.** A lookup by key on every read, write and subscription check costs
something, and waking every subscriber to ask "did you change?" costs a call each.
So a key is resolved to a slot once, and everything goes through the slot. Minting a
slot costs more than a map entry. The design bets that this pays back because
whatever is created has a consumer on a page. That does not mean updates always come out
cheaper than inserts: the measured cost of each task, insert or update, is in the
[benchmark results](https://oimdb.org/docs/benchmarks/results).

**The weight** is in [Bundle size](#bundle-size) below. OIMDB is heavier than a bare store,
because the engineering you would otherwise write is inside. The full argument, with
both versions of the same task side by side, is in [Why OIMDB](https://oimdb.org/docs/why-oimdb).

---

## Both formats ship, and one process may load only one

The build emits `dist/index.js` (ESM) and `dist/index.cjs` (CommonJS), and the
`exports` map offers both: `import` resolves to the first and `require` to the
second, with `dist/index.d.cts` handed to the `require` consumer so its
declarations and its runtime agree on the module shape. Plenty of consumers are
still on CommonJS, which is why both are here.

**If one process reaches the core both ways, the second load
throws.** `src/index.ts` registers its copy under `Symbol.for('@oimdb/core')` on
`globalThis`, and a second copy that finds another one there throws
`@oimdb/core is loaded twice in this process`. Without this check the split would be silent:
each copy keeps its own `OIMDefaults`, so a default set through one
(`OIMDefaults.ENTITY_WRITER.setValue(createOIMEntityWriterReplacing())`) never reaches a
service built by the other, which keeps writing in place. Objects built by
either copy carry their own methods, so a channel, a service and an effect
from different copies still deliver to each other; only the defaults diverge.

`@oimdb/react` loaded twice fails the opposite way: loudly, at the first render.
Every hook throws `useOIMEffectService: no <OIMDBProvider db={...}> or <OIMEffectServiceProvider
effectService={...}> above this component.` even though the provider is plainly above it. A React context's identity
IS its lookup key, so a provider from one copy and a `useContext` in the other
never meet. The error message names this as its second possible cause, because the
first sentence on its own points at the one thing that is not wrong.

The mechanism is one line: a runtime loads a package once per format, so
`import` in one file and `require` in another holds two complete copies of every
class and every module-level value, such as the `OIMDefaults` statics or a React context.

The rule is one line too: pick `import` or `require` for `@oimdb/core`, and use the
same one everywhere in the process, including inside every `@oimdb` package
that passes core objects around.

---

## Bundle size

What each consumer ships, bundled with esbuild (minified, tree-shaken, ESM).

<!-- bundle-size:begin -->
| Consumer | Minified | Minified + gzip |
|---|---:|---:|
| Everything `@oimdb/core` exports | 102689 B | 25093 B |
| One entity store slot: `OIMDB`, `createOIMEntityService`, `upsertEntity`, `getSlotByKey` | 41128 B | 10585 B |
| The same, plus one effect and `db.flush()` | 49617 B | 12713 B |
| The same, plus one index: `createOIMIndexService` | 71095 B | 17506 B |
| An ordered bucket with commands: `createOIMBucketService`, `OIMSlotContentBucketServiceArrayDriven`, `OIMBucketCommands` | 55713 B | 13767 B |
<!-- bundle-size:end -->

---

## The three layers

`src/index.ts` is the entire public surface, and it is divided in three:

| Layer | What is in it |
|---|---|
| `src/engine/` | The primitives, each a stateless service over a plain struct: `OIMChannelService.INSTANCE` over a `TOIMChannelSlot` (frames, the revision, subframes), `OIMEffectService.INSTANCE` (effects, handed the `db` on every call), `OIMSlotOwnerService` (the owner of every slot a collection filed: holds, release, emptiness, columns), the column owners (abstract `OIMColumnOwner`, `OIMColumnOwnerPushDriven` written by the collection, `OIMColumnOwnerPullDriven` derived by a computed), the content services (`OIMSlotContentEntityService` for entities, `OIMComputedValueService` for computeds), the key stores and key tree walks, the release policies, the collectors (`OIMUnusedSlotCollectorService`, `OIMReleaseSlotCollectorService*`) over the collector slot, `TOIMStoreSlot`, `TOIMComputedSlot`, `TOIMEffect`. |
| `src/facade/` | What a caller holds. The collection services `OIMSlotCollectionService` (keyed) and `OIMSingleSlotService` (one slot, no key), each with its `slotContentService`; the bucket content services `OIMSlotContentBucketServiceSetDriven`, `OIMSlotContentBucketServiceArrayDriven`, `OIMSlotContentBucketServiceSortedArrayDriven` and `OIMBucketCommands`; the auto-index `OIMIndexService` and `OIMIndexServiceSortedArrayDriven`; `OIMComputedService`, `OIMComputedServiceSorted`, `OIMComputedServiceBucketMemo`. |
| `src/factories/` | `OIMDB`, `OIMDefaults`, `OIMDefaultValue`, and the doors that build a service: the base ones, `createOIMSlotCollectionService`, `createOIMSingleSlotService` and `createOIMSlotContentEntityService`, and the convenience ones over them, `createOIMEntityService`, `createOIMSingleEntityService`, `createOIMBucketService`, `createOIMSingleBucketService`, `createOIMIndexService`, `createOIMIndexServiceByCompositeKey`, `createOIMIndexServiceSortedArrayDriven`, `createOIMComputedService`, `createOIMComputedServiceSorted`, `createOIMComputedServiceBucketMemo`, `createOIMEntityWriterInPlace`, `createOIMEntityWriterReplacing`. |

**A service holds no data; a store slot is one instance.** A service is built once per
type, and `cardService.createStoreSlot(db)` returns a `TOIMStoreSlot`, a plain object whose
`store` is the keyed store and whose `channelSlot` is the channel it reports to. A collection
service has two halves. Its own doors read and mint slots, and take the store slot first:
`cardService.getSlotByKey(cards, pk)`, `cardService.holdSlotByKey(cards, pk)`,
`cardService.findSlotByKey(cards, pk)`, `cardService.getSlots(cards)`,
`cardService.getSlotCount(cards)`, plus the column doors (`getColumn`, `holdColumn`, …). Its
`slotContentService` holds the content and every write: `cardService.slotContentService.upsertEntity(cards, card)`
takes the store slot, and a door handed a slot takes only the slot, because the slot carries its
own store slot (`slot.storeSlot`): `cardService.slotContentService.updateEntity(slot, patch)`.
The owner of the slots is reached through `slot.owner` (an `IOIMSlotOwner`: hold, unhold,
release, subscribe), never through the service.

---

## The shortest thing that delivers

```typescript setup
import {
    OIMBucketCommands,
    OIMBucketArrayMembershipUnique,
    OIMChannelService,
    OIMDB,
    OIMDefaults,
    OIMEffectService,
    OIMErrorPolicyLogAndContinue,
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotReleasePolicyAfterWrite,
    OIMSlotReleasePolicyEarliest,
    OIMSlotStoreServiceMapDriven,
    OIMSlotStoreServiceSingleSlotDriven,
    OIMSlotStoreServiceTreeDriven,
    OIMUnusedSlotCollectorService,
    createOIMUnusedSlotCollectorSlot,
    oimInsertEntityWithCopy,
    oimIsSlotReleased,
    createOIMBucketService,
    createOIMComputedServiceBucketMemo,
    createOIMComputedService,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMIndexService,
    createOIMIndexServiceSortedArrayDriven,
    createOIMSingleEntityService,
    createOIMSlotCollectionService,
    createOIMSlotContentEntityService,
    oimOrderedListCommandsOfTransition,
    oimSameSlotSequence,
    oimSameValueZeroGuard,
    type TOIMComputedSlot,
    type TOIMBucketSlotsArrayUniqueStore,
    type TOIMBucketSlotsArrayStore,
    type TOIMBucketSlot,
    type TOIMBucketSlotsSetStore,
    type TOIMDisposer,
    type TOIMEntityColumnName,
    type TOIMEntitySlot,
    type TOIMOrderedListCommand,
    type TOIMSingleSlotStore,
    type TOIMSlotStoreTree,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; deck: string; title: string; rank: number };
type CardSlot = TOIMEntitySlot<Card>;

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const slot = cardService.getSlotByKey(cards, 'c1');
const byRank = (leftBucketMemberSlot: TOIMEntitySlot<Card>, rightBucketMemberSlot: TOIMEntitySlot<Card>): number =>
        (leftBucketMemberSlot.entity?.rank ?? 0) - (rightBucketMemberSlot.entity?.rank ?? 0);
```

```typescript
cardService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });

let seen = '';
const effect = effectService.createEffect(db, [slot], [], () => {
    seen = slot.entity?.title ?? '';
});

cardService.slotContentService.updateEntity(slot, { title: 'Ace of Spades' });
db.flush();         // seen === 'Ace of Spades'

effectService.disposeEffect(effect);
```

`OIMDB` is the shared state and nothing else: one `clock` (`{ revision, epoch }`), one
`defaultChannelSlot` (a `TOIMChannelSlot`, the struct a channel's state lives in), one
`collectorSlot` (the unused-slot collector's slot and one slot per release collector), and the
`entityWriter`, `slotStamp`, `slotReleasePolicy` and `indexKeysService` its constructor is handed,
which it keeps as the default that every door below reads. It is an `IOIMChannelMap`, so
anything that takes a `channelMap` takes the `db`. `flush()` is
`OIMChannelService.INSTANCE.flush(db.defaultChannelSlot)`: it runs the pending frame, then the
unused-slot collector, then the after-each-flush handlers, in that order. It builds nothing.

There is no channel object and no effect service instance per channel. `OIMChannelService.INSTANCE`
and `OIMEffectService.INSTANCE` are stateless; every call is handed the channel slot (or the `db`
whose `defaultChannelSlot` it is). A store slot carries its own channel slot as
`storeSlot.channelSlot`, and an effect as `effect.channelSlot`.

There is no default scheduler, on purpose. A test calls `db.flush()`; an
application gives that call to the orchestrator. With cnstra that is one line:
a drain listener that calls `db.flush()` at the end of every synchronous turn of every
stimulation. Each turn is then one frame, and a neuron that awaits a request
delivers its loading state first and the data in a later frame with no extra code.
Every mutation goes through a domain neuron. See
[With cnstra](https://oimdb.org/docs/guides/with-cnstra).

The doors are free functions, one module each, and each builds a **service**, once per
type; an instance is the store slot that service creates. A door over a collection takes
`db` first and ONE options object second. On the bucket door the object is optional while the
key is a `TOIMStoreKey`. With an array key the type requires it, and it must include a
`bucketSlotStoreService` (`OIMSlotStoreServiceTreeDriven`), because a map-driven store compares
arrays by reference; that argument list is `TOIMBucketCollectionFactoryArguments`. A collection
under no key at all is a single service: `createOIMSingleEntityService` /
`createOIMSingleBucketService`; see [The six shapes](#the-six-shapes). An index takes a scalar key
through `createOIMIndexService` and an array key (several columns) through
`createOIMIndexServiceByCompositeKey`, which sets the tree-driven store itself. The computed doors
take no `db`: a computed reaches its channel through the store slot it derives from, or through
the `db` handed to `createComputedStoreSlot`.

```typescript signature
createOIMEntityService<Card, TColumnName?, TKey?, TStore?>(db, { keyOf, entityWriter?, slotEmptiness?, slotReleasePolicy?, columnSlotStoreService? | columnNames?, entitySlotStoreService? })
createOIMSingleEntityService<Card, TColumnName?>(db, { entityWriter?, slotEmptiness?, slotReleasePolicy?, columnSlotStoreService? | columnNames? }?)
createOIMBucketService<TBucketMemberSlot?, TKey?, TSlots?, TSlotContentService?, TStore?>(db, { slotContentService?, bucketSlotStoreService?, maxCommandsPerSlot?, slotReleasePolicy?, columnSlotStoreService? | columnNames? }?)
createOIMSingleBucketService<TBucketMemberSlot?, TSlots?, TSlotContentService?>(db, { slotContentService?, maxCommandsPerSlot?, slotReleasePolicy?, columnSlotStoreService? | columnNames? }?)
createOIMIndexService(db, { entityService, columns | keyOf, slotContentService?, bucketSlotStoreService?, slotReleasePolicy?, columnSlotStoreService? | columnNames? })
createOIMIndexServiceByCompositeKey(db, { entityService, columns, slotContentService?, slotReleasePolicy?, columnSlotStoreService? | columnNames? })
createOIMIndexServiceSortedArrayDriven(db, { entityService, sortColumns, columns | keyOf, bucketSlotStoreService?, slotReleasePolicy?, columnSlotStoreService? | columnNames? })
createOIMComputedService<TKey, TValue, TComputedStore?>({ createSources?, derive?, sameValueGuard?, initialValue?, slotReleasePolicy?, computedSlotStoreService?, columnSlotStoreService? | columnNames? })   // a non-Map store: computedSlotStoreService required
createOIMComputedServiceSorted({ indexService, sortColumns?, comparator?, slotReleasePolicy?, computedSlotStoreService?, columnSlotStoreService? })
createOIMComputedServiceBucketMemo({ bucketCollectionService, slotReleasePolicy?, computedSlotStoreService?, columnSlotStoreService? })

cardService.createStoreSlot(db)                         // an entity or bucket store slot, reporting to db.defaultChannelSlot
indexService.createIndexStoreSlot(cards)                // the index's bucket store slot over one entity store slot
sortedService.createSortedStoreSlot(indexStoreSlot)     // a sorted store slot over one index store slot
orderService.createBucketMemoStoreSlot(bucketStoreSlot) // one derivation per bucket of a bucket store slot
computedService.createComputedStoreSlot(db, derive?, createSources?)
```

**The convenience doors sit on two base ones.** `createOIMEntityService(db, options)` is
`createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService(db, options) })`,
and `createOIMSingleEntityService` is the same over `createOIMSingleSlotService`. The content
service is where everything per type is fixed, once: the `keyOf`, the entity writer, the
emptiness rule, the store service, and the slot owner built from `db.slotStamp`, the release
policy and the column options. The collection service only lends that content service's owner
and store service its doors. Call the base doors when the content service is built elsewhere and
shared, or when you want the content service in hand before the collection:

```typescript
const cardContentService = createOIMSlotContentEntityService<Card>(db, { keyOf: (card) => card.id });
const sameShapeCardService = createOIMSlotCollectionService({ slotContentService: cardContentService });
const sameShapeCards = sameShapeCardService.createStoreSlot(db);
```

The bucket doors take the type of the bucket member slots, `TBucketMemberSlot extends TOIMSlot`
(default `TOIMEntitySlot`). A bucket holds bucket member slots of any slot type (entity slots,
bucket slots, computeds), and an index's `getEntitiesByKey` is there because its members are
entity slots.

Each door reads the globals that the class it builds would otherwise fall back to and
**always passes them**, so there is one answer to each question and no class
reaches for a default of its own.

The doors are free functions, not methods on `OIMDB`, so a consumer who wires
nothing does not import the bucket machinery. This is pinned by
`tests/what-an-import-retains.test.ts` (the root retains no door) and by
`src/factories/tests/which-answer-a-collection-the-root-mints-gets.test.ts`.

**A bucket's content service decides how it holds its slots.** `createOIMBucketService` takes it
as `slotContentService`. With none, it builds an `OIMSlotContentBucketServiceArrayDriven`
(insertion order, never re-decided) with an `OIMBucketCommands` that records what each position
write did; `maxCommandsPerSlot` caps that record. Pass
`new OIMSlotContentBucketServiceSetDriven<TMember>()` for a bucket that keeps its slots in a set,
and `new OIMSlotContentBucketServiceSortedArrayDriven({ compareBucketMemberSlots })` for one kept in
a comparator's order. A bucket's reads and writes are on that content service:
`bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, slots)`.

**A bucket never sorts, except a sorted one.** The order of an array-driven bucket is what the
caller put in: `addBucketMemberSlot` appends, `insertBucketMemberSlotAt` inserts, a move moves.
A sorted list is a computed over an index.
See [A sorted list is a computed over an index](#a-sorted-list-is-a-computed-over-an-index);
for the index whose buckets sort themselves, see [A sorted index: sorted at write](#a-sorted-index-sorted-at-write).

Every property of a door's options is a choice made once at construction: **where identities
live** (`entitySlotStoreService`, the strategy every store slot of the service files its slots
with), **how a key comes out of an entity** (`keyOf`), **how a write lands** (`entityWriter`),
**what counts as empty** (`slotEmptiness`), **when a slot goes** (`slotReleasePolicy`), and
**where column slots live** (`columnSlotStoreService`, or `columnNames` for the ordinal store; the
slot owner makes its own column owner over it). Everything but `keyOf` falls back to the `db` or
to a lazy `OIMDefaultValue` on [`OIMDefaults`](#every-optional-dependency-has-a-default).

---

## A collection always reports to a channel

There is no argument that turns delivery off. A store slot is created on a `db` and carries
`db.defaultChannelSlot` as its `channelSlot`; every write door reports to that channel, and the
unused-slot collector a read hands its mint to is that channel slot's `collectorSlot`.

```typescript
const deliveringCardService = createOIMEntityService<Card>(db, {
    keyOf: (card) => card.id,
    entitySlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMEntitySlot<Card, TOIMStoreKey>>(),
    columnSlotStoreService: OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue(),
});
const deliveringCards = deliveringCardService.createStoreSlot(db);
```

The entity collection overrides nothing. `createOIMSlotContentEntityService` builds an
`OIMSlotContentEntityService`, whose constructor builds the type's `OIMSlotOwnerService` and hands
it a private content strategy (`createSlot`, `isSlotEmpty`, `releaseSlotContent`,
`hasReference`), which is how the owner asks the content about a slot without the content's write
doors being reachable from the owner. `createOIMSlotCollectionService` then wraps that content
service's owner and store service in an `OIMSlotCollectionService`.

`keyOf` is the one required option. `entityWriter` falls back to `db.entityWriter`, then to
`OIMDefaults.ENTITY_WRITER`; `slotEmptiness` to `OIMDefaults.ENTITY_SLOT_EMPTINESS`;
`slotReleasePolicy` to `db.slotReleasePolicy`, then to nothing, which is the default of "a slot
with a value stays for good" described under **The injected seams**; the column store to
`OIMDefaults.COLUMN_SLOT_STORE_SERVICE`.

A single entity is the same content service under a `void` key, built by
`createOIMSingleEntityService`, and it reports the same way.

---

## Every optional dependency has a default

`OIMDefaults` is where a default that would otherwise be an object lives. It is a
class of static `OIMDefaultValue` fields and nothing else; you never construct one.

| Accessor | Type | What it hands back |
|---|---|---|
| `OIMDefaults.COLUMN_SLOT_STORE_SERVICE` | `IOIMSlotStoreService<string, TOIMColumnSlot>` | a map-driven store service for column slots; the factories pass it to every service they build without `columnNames` |
| `OIMDefaults.COMPUTED_COLUMN_SLOT_STORE_SERVICE` | `IOIMSlotStoreService<string, TOIMComputedColumnSlot>` | a map-driven store service for the column slots of computed services, keyed or single; the computed factories pass it to every one they build without `columnNames` |
| `OIMDefaults.KEY_TREE_WALK_SCALAR` | `OIMKeyTreeWalkScalar` | the chain-of-values walk |
| `OIMDefaults.KEY_TREE_WALK_COMPOSITE` | `OIMKeyTreeWalkComposite` | the chain-of-identities walk |
| `OIMDefaults.STANDALONE_SLOT_OWNER` | `OIMSlotOwner` | the owner of a slot nobody filed |
| `OIMDefaults.ENTITY_WRITER` | `IOIMEntityWriter` | `createOIMEntityWriterInPlace()` |
| `OIMDefaults.ENTITY_SLOT_EMPTINESS` | `IOIMSlotEmptiness<TOIMEntitySlot>` | "empty means `slot.entity === undefined`" |
| `OIMDefaults.INDEX_KEYS_SERVICE` | `IOIMIndexKeysService` | an `OIMIndexKeysServiceAppending`; see [Index keys strategy](#index-keys-strategy) |
| `OIMDefaults.STORE_SLOT_LISTENER` | `IOIMStoreSlotListener` | `OIMStoreSlotListenerNone`, which hears nothing. It is not a constructor option: every service reads it when built and calls `onStoreSlotCreated(storeSlot)` for each store slot it creates. Set your own with `setValue` before the first service is built; afterwards `setValue` throws |

**Nothing is constructed at module load.** Every entry is an `OIMDefaultValue`
whose `getValue()` mints on its first call (`??=`) and hands back the same instance
for the rest of the process, so a consumer that never reaches for a key tree walk
never builds one.

Each has a matching `setValue(value)`, which is how a process replaces a default
everywhere at once. **`setValue` throws once `getValue` has handed the first one
out**, naming the property: `OIMDefaults.ENTITY_WRITER has already been handed
out`. Whoever took the default keeps it, so a late replacement would leave two
implementations live in one process, with the older one inside every object built
before the call.

Setting a default before the first read works, and so does setting it twice before then. Each
property is tracked on its own, so calling `OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()` does not close
`OIMDefaults.KEY_TREE_WALK_SCALAR`. Set every default you mean to replace at startup, before
any `OIMDB` or service exists.
`src/factories/tests/what-a-default-replaced-too-late-does.test.ts` pins this.

**One module names every default, so calling one `getValue()` retains all of them.** A
service drags the map-driven store service and both key tree walks into a
bundle even when it calls neither. That is the cost of the single door, and a
bundler cannot drop a strategy that nothing named.
`tests/what-an-import-retains.test.ts` pins the shape: *"the defaults module is one door to every arm behind it"*.

---

## The four doors that mint an identity

**Writing a value, subscribing, taking a hold, and reading a key that has none.**
Each is admitted because the act **leaves a reference behind** on what it produced
(a value, an effect, a count, or a tracked mint), so nothing can unfile the
identity under the caller who just got it.

```typescript
const card: Card = { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 };
const key = 'c1';
const body = (): void => {};

cardService.slotContentService.upsertEntity(cards, card);          // write:     the value is the reference
cardService.slotContentService.insertEntity(cards, key, card);     // write:     the same door, by key
const entitySlot = cardService.holdSlotByKey(cards, key);          // hold:      a counted reference; give it back with entitySlot.owner.unholdSlot(entitySlot)
effectService.createEffect(db, [entitySlot], [], body);            // subscribe: the effect is the reference
const rankColumn = cardService.holdColumn(entitySlot, 'rank');     // hold, on a column
cardService.unholdColumn(rankColumn);                              // give the column back
cardService.getSlotByKey(cards, key);                              // read:      the collector's hold is the reference
```

**The read that does not mint is `findSlotByKey(storeSlot, key)`.** It answers `undefined`
for a key with nothing filed, which is how a caller changes or removes a key without minting
it: `const s = cardService.findSlotByKey(cards, key); if (s !== undefined) cardService.slotContentService.deleteEntity(s);`.
It hands back only what is already filed and leaves no reference behind, so it is not a door
that mints. `cardService.slotContentService.findEntityByKey(storeSlot, key)` and
`cardService.hasSlotContentByKey(storeSlot, key)` mint nothing either.

**`getSlotByKey(storeSlot, key)` is the fourth door, and the collector is what admits it.** It
mints what is missing and hands the slot to the unused-slot collector of the store slot's channel
(`OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(storeSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot, slot)`),
which takes the hold on the caller's behalf and gives it back at the next `flush()`.
The reference is still left behind, but the collector owns it instead of the
caller, which makes it safe to use and safe to forget. `insertEntity` relies on the same
window when the content it wrote landed empty: the
mint is tracked, so the identity it handed back stands until the collector gives
it back, and goes then if nothing took it.

**The write door also does not file a key whose content is refused.** On a miss,
`insertEntity` mints, writes inside a `try`, and on a throw runs
the release guard on what it just minted before re-raising, so the caller's error
is the only thing that leaves. *Filing first and writing second is the obvious
alternative, and it is wrong. One `upsertEntity` of an unseen key from inside a
subscriber body (the service's write opens with the frame guard)
would leave the key filed holding nothing, with nothing in a position to let it go.
`getSlotByKey` would answer a slot with no value, `insertEntities` would refuse for the life of the
store slot, and nothing would throw except the refusal the caller had asked for.* The
unwind is the release guard rather than a `store.remove` because the write may
have half landed, and the hit path never mints and stays outside the guard.

**Refused is not the same as unchanged**, and only a refusal unwinds anything.
A **refusal** means no content ever arrived: the write did not happen, nothing
keeps the key, and that identity is unwound. **Unchanged** means the write *did*
happen and the content was already there. The door completed and the caller is
handed the identity. Whether an identity that nothing keeps is worth keeping is
the owner's question, asked through its release guard.

So `insertEntity` is **total**: it always hands back the identity it resolved or
minted, whatever it decided about the content, because a door that mints must
leave a reference behind.

`fillEntities(storeSlot, keys, entities)` is the companion and does not carry that rule, because it returns
`void` and hands out no reference at all. On a throw it runs the release guard
over everything it filed and keeps only what something holds. This is bounded by the
precondition that the store slot was empty when the call began.

A fifth door is admitted by this test and by nothing else: the act has to leave
a reference behind that nothing can take away under its caller. A helper over an
existing door does not qualify. It is a **second spelling** of one, and two
spellings of a mint is how the rule stops being checkable.

### A slot goes when nothing refers to it

A reference is given back by whoever took it. The terms are:

| Term | Given back by |
|---|---|
| `holdCount` | `owner.unholdSlot(slot)`, or `unholdColumn(columnSlot)` for a column; the unused-slot collector's `flush` for a `getSlotByKey`; `OIMEffectService.INSTANCE.disposeEffect(effect)`, for the hold an effect takes on each root the caller named |
| `effects` | `OIMEffectService.INSTANCE.disposeEffect(effect)` |
| a held column | the last column effect being disposed, through the column's owner (`slot.owner.unsubscribeFromSlot`) |
| the value itself | `entityService.slotContentService.deleteEntity(slot)` |
| a slot in a bucket | `bucketService.slotContentService.clearBucketMemberSlots` / `writeBucketMemberSlots` / a positional removal |
| a composite-key edge | `OIMKeyTreeWalkComposite.deleteKey` unlinking that composite key part |

When the last of them goes, the identity's **owner** unfiles it. There is no
release API and no owner that a caller assigns. `releaseSlotIfUnheld(slot)` is **public**
on `IOIMSlotOwner` because the release policy's queue reaches it through `slot.owner`, but
it is a guard, not a
command. It returns having done nothing unless the slot is unheld, unreferenced,
still owned by the object asked and out of grace, and it returns **silently** on
a slot that something else already released. A slot in a bucket is a counted
reference, so a slot in a bucket you never emptied stays for as long as that
bucket does.

**Where a service was given an idle window, the last subscriber's departure is
not the removal.** It is the moment that window opens. See [Releasing an
identity on a clock](#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).

That is per identity. Ending the **whole** channel is the level above and has its
own call. See [Ending the channel whole](#ending-the-channel-whole).

---


### A service composes

Every collection is three parts: a **store service** (`IOIMSlotStoreService`: the slots by
key, in the store each store slot carries; `OIMSlotStoreServiceMapDriven`,
`OIMSlotStoreServiceTreeDriven`, `OIMSlotStoreServiceSingleSlotDriven`), a **slot owner**
(`OIMSlotOwnerService`, an `OIMSlotOwner`: the owner of every slot it filed, with holds, release,
emptiness, the channel's subframes and the column owner) and a **content service**
(`OIMSlotContentEntityService`, an `OIMSlotContentBucketService*`, or a computed's
`OIMComputedValueService`), with the collection service (`OIMSlotCollectionService` /
`OIMSingleSlotService`) lending the first two their by-key doors. The owner asks the content
about a slot through a content strategy the content service hands it, never through an override:

| Strategy member | Called by the owner when |
|---|---|
| `createSlot(key, storeSlot, slotOwnerService)` | a key is minted |
| `isSlotEmpty(slot)` | emptiness is settled after a write |
| `releaseSlotContent(slot, slotOwnerService)` | the identity is going. Give back what its content held |
| `hasReference(slot)` | something outside `holdCount` and `effects` may keep it |

The strategy is private to the content service: the owner holds it, the caller never sees it.
An entity content service builds its owner itself, in its constructor, so the owner and the
content are fixed together once per type; a bucket content service hands a factory
(`createOIMBucketService`) its owner through `createSlotOwnerService`.

The entity content service is the example to follow in the package: it supplies the content
answers, the owner unfiles through the store service, and every write door opens the channel's
content subframe around it.

### The injected seams

```typescript signature
interface IOIMSlotEmptiness<TSlot> { isEmpty(slot: TSlot): boolean; }

interface IOIMSlotStamp<TSlot> { stamp(slotEditable: TOIMSlotEditable<TSlot>): void; }
```

**`IOIMSlotEmptiness`** decides what counts as empty. The answer is written once
per write into the EMPTY flag of `slot.slotFlags` and never recomputed at a read. An entity content
service defaults to "the entity is `undefined`" (`OIMDefaults.ENTITY_SLOT_EMPTINESS`); a bucket
content service answers "`getBucketMemberSlotCount(bucketSlot) === 0`"; a computed answers
`false`.

Emptiness decides lifetime, never the write path. An `upsertEntity` onto an entity slot that
still carries an entity merges into it even when emptiness calls it empty (a soft
delete, a seed), so a column that the new entity drops is woken and an unchanged one is
not. Only a slot with no entity at all is filled whole.

**`IOIMSlotStamp`** writes onto the slot at every write, just before emptiness is
settled, and it chains: each stamp takes the `next` one and calls it first. Use it
for stamps that have nothing to do with release; release has its own policy.

**`IOIMSlotReleasePolicy`** decides whether and when a slot goes, and does no
work itself. A door and `OIMDB` take ONE through `slotReleasePolicy`; a door given none takes
`db.slotReleasePolicy`. With neither, the slot owner is built with `OIMSlotReleasePolicyAtEmpty`:
a slot with a value stays for good. A computed service defaults to
`OIMSlotReleasePolicyAtUnhold`. Two readonly flags on the policy, `releasesWrittenSlots` and
`schedulesReleaseOnWrite`, are read once by the owner at construction, so a policy that never
releases on a write costs a write nothing.

**TWO RELEASE MARKERS, ONE PER POLICY.** A slot carries two deadlines, and each
policy moves only its own. `-1` means unset.

| Marker | Moved by | Not moved by |
|---|---|---|
| `releaseDueAfterWriteMs` | every write, under `OIMSlotReleasePolicyAfterWrite` | a subscriber arriving or leaving |
| `releaseDueAfterIdleMs` | the first content of a slot with no subscriber, and the departure of the last subscriber, under `OIMSlotReleasePolicyAfterIdle` | a later write |
| `releaseDueAfterUnholdMs` | every last unhold, under `OIMSlotReleasePolicyAfterUnhold` | a write |

A slot goes on the SOONEST of those that are set, and a hold outranks them all.
**One number cannot carry both.** A write arriving after the subscriber left
would overwrite the idle policy's verdict, and the last subscriber leaving after a
write would overwrite the write policy's. Both directions are pinned by
`src/engine/collector/tests/which-release-marker-each-collector-may-move.test.ts`.

**The POLICY answers `isSlotReleasable(slot)`**, and only for a slot that is not
empty and has nothing left keeping it (no holds, no references). `true` releases
the slot now. `false` keeps it, and a policy with a finite deadline has already
filed the slot into its own release queue; a slot whose marker is `-1` is kept
with nothing scheduled. `OIMSlotReleasePolicyAtUnhold` always answers `true`, and
`OIMSlotReleasePolicyEarliest` asks every member and answers `true` if any member does.
An **empty** slot is asked about through `isEmptySlotReleasable(slot)`: every
policy except `OIMSlotReleasePolicyNever` answers `true`. A service given no
policy is built with `OIMSlotReleasePolicyAtEmpty`: it keeps a non-empty slot and
lets an empty one go, and no path branches on a missing policy. The owner has no
"how long is left" question.

### Releasing an identity on a clock — opt-in, and off it costs nothing

Four policies ship, plus `OIMSlotReleasePolicyEarliest`, which combines them. The difference between
them is WHEN a slot goes. There is no flag, and no branch on the sweep path.

| Policy | A slot goes |
|---|---|
| `new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs })` | once its last write is older than the window |
| `new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs })` | once nothing has watched it for the window |
| `new OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs })` | once the window after its LAST unhold has passed; a hold taken again inside it keeps the slot |
| `OIMSlotReleasePolicyAtUnhold.INSTANCE` | at the last unhold, even with a value |
| `OIMSlotReleasePolicyAtEmpty.INSTANCE` | once it has no value and nothing holds it; a computed, never empty, stays while its owner lives |
| `OIMSlotReleasePolicyNever.INSTANCE` | never, empty or not; a deleted key's slot stays filed |
| `new OIMSlotReleasePolicyEarliest([...])` | when the earliest of several deadlines falls due — a `min` over deadlines |

A policy holds only its window. The clock, the timer and the queues are the `db`'s: each `OIMDB`
has a `collectorSlot` with one release collector slot per windowed policy
(`afterWriteReleaseSlotCollectorSlot`, `afterIdleReleaseSlotCollectorSlot`,
`afterUnholdReleaseSlotCollectorSlot`), built from `new OIMDB({ getNowMs, releaseTimer, errorPolicy })`.
A policy reaches the one for a slot through the slot's channel
(`slot.storeSlot.channelSlot.collectorSlot`). To control time in tests, pass `getNowMs` and
`releaseTimer` to the `OIMDB`. `OIMSlotReleasePolicyAtUnhold` is the zero window and touches no
collector.

```typescript signature
interface IOIMSlotReleasePolicy {
    readonly releasesWrittenSlots: boolean;
    readonly schedulesReleaseOnWrite: boolean;
    onSlotWritten(slot: TOIMSlot): void;
    onSlotIdle(slot: TOIMSlot): boolean;
    onSlotUnheld(slot: TOIMSlot): void;
    isSlotReleasable(slot: TOIMSlot): boolean;
    isEmptySlotReleasable(slot: TOIMSlot): boolean;
    cancelSlotRelease(slot: TOIMSlot): void;
}
```

A zero window never touches a release queue or a timer: when a slot goes idle with
`onSlotIdle` answering `true`, it is released at once if nothing holds it, and
a freshly minted slot that is already due goes to the unused-slot collector and
leaves at the end of the frame. A window above zero is filed in that policy's own
queue.

```typescript
const releasingDb = new OIMDB({
    slotReleasePolicy: new OIMSlotReleasePolicyEarliest([
        new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 60_000 }),
        new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 30_000 }),
    ]),
});
```

- **NEITHER READS `slot.effects`.** An effect takes a **hold** on every root it
  reaches. `OIMEffectService.createEffect` calls `root.owner.subscribeToSlot(root, …)`, which holds each slot
  in `allRootSlots` (the roots the caller named plus the ones
  reached through the derivations it was given), and holds each of those
  derivations too. `disposeEffect(effect)` gives them all back. The hold is the whole
  signal, so a release policy has no list to count.
- **RUNNING BOTH SHARES NOTHING.** Each windowed policy has its own release collector slot on
  the `db`'s `collectorSlot`, and each slot carries its own queue and its own timer: two queues,
  two timers.
  Whichever deadline falls due first takes the slot, and nothing has to be
  reconciled. `OIMSlotReleasePolicyEarliest` answers a `min` over its members'
  deadlines, so a sweep of either queue reaches the same verdict.

### When a window opens, and when the clock is not running at all

A window opens in **exactly two places**:

1. **when the slot first gets content and nobody subscribes to it**: the write that
   takes it from empty to filled, in the owner's `settleEmptiness`. A slot minted empty by a read
   that found nothing is not on any clock;
2. **when the LAST SUBSCRIBER leaves**: `OIMSlotOwner.unsubscribeFromSlot` takes the
   last entry out of `slot.effects` and runs the idle step, which opens a window.

Both ask the policy's `onSlotIdle(slot)`. Under `OIMSlotReleasePolicyAfterIdle`
it stamps `releaseDueAfterIdleMs = getNowMs() + keepAfterIdleMs` and files the slot
into the policy's queue. An **empty** slot gets no window, and the release guard
takes it without asking a clock.

**A HELD SLOT IS OFF THE CLOCK.** A sweep that meets one decides nothing and
does not re-file it. Two consequences follow:

- **A hold defers the verdict; it does not restart the clock.** `unholdSlot` reaches
  the release guard, not an idle window, so an entity whose window ran out while
  it was held goes at the give-back itself.

  ```typescript
  const entitySlot = cardService.holdSlotByKey(cards, 'c1');
  // …the window passes, sweeps run, nothing happens to this slot…
  entitySlot.owner.unholdSlot(entitySlot);
  oimIsSlotReleased(entitySlot); // true — the give-back settles what the sweep could not
  ```

  A **subscriber** leaving is the other case: `unsubscribeFromSlot` stamps a whole fresh
  window first, so the last `dispose()` grants a full one.

- **A cascade takes one sweep, not one window per level.** A stale index goes when
  its own window runs out, and giving back the hold it had on each entity is a departure
  that those entities' own expired windows already answer for, so the entities go in the
  same sweep.

Pinned by `src/engine/collector/tests/what-a-stale-index-takes-with-it.test.ts`,
`…/what-an-identity-nobody-subscribed-to-costs-after-a-while.test.ts` and
`…/what-a-subscribed-row-costs-the-release-clock.test.ts`.

**The grace is consulted only on a slot that is NOT empty.** The release guard
checks `holdCount`, then `oimIsSlotReleased(slot)`, then `slot.owner !== this`, then
`hasReference`, and only then, on a slot that is not empty, asks the policy's
`isSlotReleasable`, which is where the idle window is reached. So an idle window never keeps an
identity that holds nothing, and a held one never reaches the question at all.

### The collectors

A release policy decides; the collector under it does the work of waiting and
sweeping. A collector is a stateless service over a collector slot, and every `OIMDB` builds its
slots once, in `db.collectorSlot`:

```typescript signature
new OIMDB({ getNowMs?, releaseTimer?, errorPolicy? })   // getNowMs defaults to Date.now, releaseTimer to an unref'd setTimeout
db.collectorSlot.unusedSlotCollectorSlot                // OIMUnusedSlotCollectorService.INSTANCE
db.collectorSlot.afterWriteReleaseSlotCollectorSlot     // OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE
db.collectorSlot.afterIdleReleaseSlotCollectorSlot      // OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE
db.collectorSlot.afterUnholdReleaseSlotCollectorSlot    // OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE
```

A release that throws inside a `flush(releaseSlotCollectorSlot)` called by hand throws to that
caller. A release that throws on the collector's own timer tick has no caller, so it goes to the
collector slot's `errorPolicy`, which is the `errorPolicy` the `OIMDB` was built with.

Every collector extends `OIMFlushSchedulerService`, which owns the schedule and cancel logic around
a `TOIMTimer = (run: () => void, inMs: number) => TOIMDisposer`, keeping the standing run on the
slot it schedules. Protected `schedule(slot, delayMs)` does nothing when a scheduled run is already
standing. A callback that is no longer the one the base handed the timer (a run the host could not
cancel, still queued after a manual flush) returns without touching anything, so it neither
flushes early nor lets the next request arm a second wake. The release collectors read the clock
once per schedule, and cancel and re-schedule only when a shorter window arrives. Pass your own
`releaseTimer` to the `OIMDB` to drive the collectors off a frame callback, a worker message or a
test clock.

**`OIMReleaseSlotCollectorService`** is the abstract clock the three windowed collectors extend.
Its slot (`TOIMReleaseSlotCollectorSlot`) carries the queue, `getNowMs` and the `errorPolicy`. It
sweeps the queue on `flush(slot)` and re-schedules to the next deadline;
`cancelAllSlotReleases(slot)` cancels and empties the queue, and the next scheduled release
schedules it again. The one thing a subclass supplies is `getReleaseDueMs(slot)`, the marker its
policy answers for. The default timer calls `unref` where the platform has it, so an idle process
is never held open.

**`OIMReleaseSlotQueueService`** files slots into **time slices**, not one entry each.
`oimSliceOfMs(ms)` is `Math.floor(ms / OIM_SLICE_LENGTH_MS)` and `OIM_SLICE_LENGTH_MS`
is `1024`, so every slot due inside the same ~1s bucket shares one `Set` and one
timer. Its doors take the release collector slot and the collector whose marker they read, so
two queues over two markers stay independent: `scheduleSlotRelease`, `cancelSlotRelease`,
`isSlotReleaseScheduled`, `getNextReleaseSliceNumber`, `releaseDueUpToSliceNumber` and
`cancelAllSlotReleases`. `scheduleSlotRelease` reads the marker and files at it, so a filing can
neither shorten nor extend a deadline, and a marker of `-1` files nothing.

**`releaseDueUpToSliceNumber` is where the release decision is taken, and it belongs to
the queue, not the owner.** For each slot in a due slice it skips a released one,
reads its own marker, drops the slot on `-1`, **re-files it itself** into
`oimSliceOfMs(getReleaseDueMs)` when that moment is still ahead, and otherwise calls
`slot.owner.releaseSlotIfUnheld(slot)`, which asks the policy's `isSlotReleasable`
and so declines while the other policy still keeps the slot. The
owner files nothing from inside a sweep; it opens a window only on its own events:
a mint, and the departure of the last subscriber. The sweep raises a floor for its
duration, so any re-file lands in the next slice and cannot loop.

**`OIMUnusedSlotCollectorService`** has nothing to do with time. It is what makes
`getSlotByKey` safe: `holdSlotUntilFlush(unusedSlotCollectorSlot, slot)` takes a hold, and
`flush(unusedSlotCollectorSlot)` gives every tracked hold back. `open(slot)` / `close(slot)` nest
a scope and `run(slot, body)` is the `try/finally` form; `flush` does nothing while a scope is
open. `close` with no open scope throws by name. `db.flush()` flushes the channel, and the
channel's flush ends by flushing `db.collectorSlot.unusedSlotCollectorSlot`.

### An arena: force-caching a derivation

The `db`'s unused-slot collector slot is the **default**, not the only one.
`createOIMUnusedSlotCollectorSlot()` is exported, so a caller who wants a derivation kept past the
turn that read it can build an arena of their own and end it when they choose:

```typescript
const arena = createOIMUnusedSlotCollectorSlot();
OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(arena, ranksService.computedCollectionService.getSlotByKey(ranks, 'c1'));   // held until THIS arena says otherwise
db.flush();                                                // the db's collector lets its own go; this one does not
// …the derivation is still there, and still the same object…
OIMUnusedSlotCollectorService.INSTANCE.flush(arena);       // now it goes, and with it everything only it held
```

**Tracking one derivation keeps its whole subtree, and nobody walks a tree to get
that.** A computed takes a hold on each of its own direct sources at the mint and
gives them back when released, so the arena holds the top and the chain holds
itself. Use one arena per screen, per component or per job: a scope's cache pins what
that scope read and nothing else.

Pinned by `src/engine/collector/tests/what-a-named-arena-keeps-cached.test.ts`.

Neither policy means *unread*: no read is reported to the clock. A subscriber
never loses data mid-read, because an effect holds every root it reaches, so the
release is refused while one is there. **What happens at the last dispose differs
by policy, and that is the point of shipping two.** The unsubscribe stamps a whole
fresh `releaseDueAfterIdleMs`, so the AFTER-IDLE collector grants a full window.
It does not touch `releaseDueAfterWriteMs`, so an entity that is already stale goes on that
same call through the `min`. A hold blocks the release either way, and blocks clearing the value
as well as removing the identity.

A bucket runs its own window, given to its own service. An index that nothing
holds goes when that window runs out, and the hold it gives back on each entity is
a departure that those entities' own windows answer for, so an entity whose window has also
run out goes in the same sweep. An
index that something holds keeps every entity in it, whatever the entities' own age.


## The six shapes

There are three kinds of slot: an **entity**, a **bucket**, and a derived
**value**. Each has one service, and each service gives two shapes: a single one,
a store slot that holds one slot under no key, or many, a store slot that files them by key.

| kind | single | collection |
|---|---|---|
| entity | `createOIMSingleEntityService<TEntity>(db, …)`, then `createStoreSlot(db)` | `createOIMEntityService<TEntity>(db, { keyOf, … })`, then `createStoreSlot(db)` |
| bucket | `createOIMSingleBucketService<TMember>(db, { slotContentService?, … })`, then `createStoreSlot(db)` | `createOIMBucketService<TMember>(db, { slotContentService?, … })`, then `createStoreSlot(db)` |
| computed | `createOIMComputedService<void, TValue, TOIMSingleSlotStore<TOIMComputedSlot<TValue, void>>>({ computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<…>(), … })`, then `createComputedStoreSlot(db, derive?, createSources?)` | `createOIMComputedService<TKey, TValue>({ … })`, then `createComputedStoreSlot(db, derive?, createSources?)` |

A single is not a second content API. Its content service is the same class with `TKey = void`,
over the slot store service `OIMSlotStoreServiceSingleSlotDriven`, whose store,
`TOIMSingleSlotStore<TSlot>`, is `{ slot: TSlot | undefined }`; its store slot is a
`TOIMSingleSlotStoreSlot`. The collection half is `OIMSingleSlotService` instead of
`OIMSlotCollectionService`, and it has no key in any door: `getSingleSlot(storeSlot)`,
`holdSingleSlot(storeSlot)` (given back with `slot.owner.unholdSlot(slot)`),
`findSingleSlot(storeSlot)`, which mints nothing, `hasSingleSlotContent(storeSlot)`, and the same
column doors as a collection. The content doors are the collection's:
`singleService.slotContentService.upsertEntity(storeSlot, entity)`,
`singleService.slotContentService.findEntityByKey(storeSlot, undefined)`. The single entity
door builds its content service with `keyOf: () => undefined` and the single-slot store.

A single behaves as a collection of at most one slot, and invents nothing of its own.
`createStoreSlot(db)` mints no slot: the first get or hold mints it, exactly as in a
collection. An entity single's first value arrives through `upsertEntity`, an ordinary write
that is announced to whoever subscribed. Its slot is released like any slot of its service,
under the service's release policy, and the next get mints a fresh one. A store slot is not
a slot: it has no owner, no holds and no effects, so never hold or subscribe it, and never
read `storeSlot.store` yourself.

Both computed shapes own `TOIMComputedSlot`, the plain data type
minted from `createSources`. A computed slot dies when nothing holds it; the service and
its store slot outlive it, and the service mints a fresh one on the next read or hold, by key
for the collection and under the key `undefined` for the single. A computed service's slots
are reached through its `computedCollectionService` (an `OIMSlotCollectionService`):
`computedService.computedCollectionService.getSlotByKey(storeSlot, key)` /
`holdSlotByKey(storeSlot, key)`. The value is read with
`slot.computedValueService.getValueForSlot(slot)`, and a hold is given back with
`slot.owner.unholdSlot(slot)`.

A single bucket is built like a keyed one, with `createOIMSingleBucketService`.
`singleBucketService.getSingleSlot(storeSlot)` is the `TOIMBucketSlot` to subscribe effects to
or hand to a reader. The member doors live on its `slotContentService` and take the bucket slot
first: `getBucketMemberSlots(bucketSlot)`, `getBucketMemberSlotCount(bucketSlot)`,
`hasBucketMemberSlot(bucketSlot, bucketMemberSlot)`,
`addBucketMemberSlot(s)(bucketSlot, …)`, `removeBucketMemberSlot(s)(bucketSlot, …)`,
`writeBucketMemberSlots(bucketSlot, bucketMemberSlots): boolean`,
`clearBucketMemberSlots(bucketSlot)`, `fillBucketMemberSlots`, `markContentChanged(bucketSlot)` and
`markBucketColumnsChanged(bucketSlot, patch, changedColumns)`. The array-driven content service
adds `getBucketMemberSlotAt(bucketSlot, index)`,
`getBucketMemberSlotPosition(bucketSlot, bucketMemberSlot)`, `insertBucketMemberSlotAt`,
`removeBucketMemberSlotAt`, `removeBucketMemberSlotRange`,
`moveBucketMemberSlotToPosition` and `moveBucketMemberSlotRangeToPosition`, each with the
same leading `bucketSlot`. A single bucket that is emptied and unheld is released like any
other, and the next `getSingleSlot(storeSlot)` mints a fresh, empty one.

`createOIMComputedService({ … })` takes no `db`: it fills the computed slot store service and
the column store, and the channel comes from the `db` handed to `createComputedStoreSlot`.

---

## Keys, and where identities live

The store knows how a key is taken apart, and it is a constructor
argument, not a subclass.

```typescript signature
// A scalar key: string | number.
new OIMSlotStoreServiceMapDriven<TOIMEntitySlot<Card, TOIMStoreKey>>()

// A composite key of VALUES, descended one composite key part at a time.
new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TOIMKeyedSlot<readonly TOIMStoreKey[]>>(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue())

// A composite key of IDENTITIES, descended the same way — and holding each.
new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TOIMKeyedSlot<readonly TOIMEntitySlot[]>>(OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue())
```

There are two stores, one per shape of address, and no store is ever asked at run time
which one it was handed. The chain store's two strategies are one class that takes its
descent at construction. Both strategies descend one `Map` lookup per composite key part,
keep `[a]` and `[a, b]` apart, and each composite key part keeps its own type, so `1` and
`'1'` are two composite key parts. There is no encoding step, and there must not be one.

### The two descents are a fork, and the choice is about lifetime

**A chain of values**, such as `['deck-1', 'red']`. Nothing is held, because there is
nothing to hold: nobody files `'red'`, nobody can release it, and a level's `Map`
answers for a rebuilt `'red'` exactly as it answered for the first. A branch
lives as long as the subtree under it, and goes the instant nothing is left
below it.

```typescript
type TScalarChain = readonly TOIMStoreKey[];
type Tally = { deck: string; day: string; count: number };
type TTallyStore = TOIMSlotStoreTree<TOIMEntitySlot<Tally, TScalarChain>, TOIMStoreKey>;

const tallyService = createOIMEntityService<Tally, TOIMEntityColumnName<Tally>, TScalarChain, TTallyStore>(db, {
    entitySlotStoreService:
        new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TOIMEntitySlot<Tally, TScalarChain>>(
            OIMDefaults.KEY_TREE_WALK_SCALAR.getValue(),
        ),
    keyOf: (t) => [t.deck, t.day],   // the two names, in order
});
const tallies = tallyService.createStoreSlot(db);
tallyService.slotContentService.upsertEntity(tallies, { deck: 'spades', day: 'mon', count: 1 });
tallyService.getSlotByKey(tallies, ['spades', 'mon']);
```

**A chain of identities**: each composite key part is a slot, and each edge takes a counted
hold on the identity it is keyed by. So an entity keyed by `[user, card]` keeps that
user's identity resolvable for as long as the entity is addressable, which a chain of names
cannot do.

```typescript
type User = { id: string; name: string };
type Group = { id: string; name: string };
type Enrolment = {
    user: TOIMEntitySlot<User, TOIMStoreKey>;
    group: TOIMEntitySlot<Group, TOIMStoreKey>;
    since: number;
};
type TChain = readonly TOIMEntitySlot[];

const userService = createOIMEntityService<User>(db, { keyOf: (user) => user.id });
const users = userService.createStoreSlot(db);
const groupService = createOIMEntityService<Group>(db, { keyOf: (group) => group.id });
const groups = groupService.createStoreSlot(db);
const alice = userService.slotContentService.upsertEntity(users, { id: 'alice', name: 'Alice' });
const admins = groupService.slotContentService.upsertEntity(groups, { id: 'admins', name: 'Admins' });

type TEnrolmentStore = TOIMSlotStoreTree<TOIMEntitySlot<Enrolment, TChain>, TOIMEntitySlot>;

const enrolmentService = createOIMEntityService<Enrolment, TOIMEntityColumnName<Enrolment>, TChain, TEnrolmentStore>(db, {
    entitySlotStoreService:
        new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TOIMEntitySlot<Enrolment, TChain>>(
            OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue(),
        ),
    keyOf: (m) => [m.user, m.group], // the two identities, in order
});
const enrolments = enrolmentService.createStoreSlot(db);
enrolmentService.slotContentService.upsertEntity(enrolments, { user: alice, group: admins, since: 2026 });
enrolmentService.getSlotByKey(enrolments, [alice, admins]);
```

The two descents are `OIMKeyTreeWalkScalar` and `OIMKeyTreeWalkComposite`, and
`OIMDefaults` holds one stateless instance of each. The composite walk
is the one whose `holdCompositeKeyPart` runs `entitySlot.owner.holdSlot(entitySlot)` when `mintNodeAt` creates an edge, and
whose `unholdCompositeKeyPart` runs `entitySlot.owner.unholdSlot(entitySlot)` (unless `oimIsSlotReleased(entitySlot)`) on exactly the edges `deleteKey` unlinked; the scalar walk holds nothing.
`deleteKey(rootCompositeKeyNode, compositeKey)` takes the value filed at the key in one
descent (one `Map.get` per key part, no array of the path) and unlinks the nodes that the
delete left empty. A node that still leads to a longer key stays.
Both walks throw `an empty key is not a key` on `[]`.

**A scalar is not a composite key part of a composite-walk key.** It is a compile
error, and past a cast it throws inside the mint (`Cannot create property
'holdCount' on string`) with the edge already in the tree. Hand the store
`OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()` instead of using a cast.

**Compare a chain with the strategy that matches it.** `oimSameSlotSequence` walks identities by
reference. Using it on a chain of values is the `NaN` defect: it answers
"a different address" for the address the tree itself is looking at. A chain or list of values
goes to `oimSameKeySequence`, which compares each key by SameValueZero, the way a `Map` files it.

---

## Writing

Every write on an entity collection is on its `slotContentService`, and is stated in terms of an
**entity** or of an **identity you already hold**. There is no write by key: a key is resolved
to a slot once, with `findSlotByKey` (mints nothing) or `getSlotByKey` / `holdSlotByKey` on the
collection, and the write goes through the slot. A door by key takes the store slot first; a door
on a slot takes only the slot.

| Call on `entityService.slotContentService` | What it does |
|---|---|
| `upsertEntity(storeSlot, entity, changedEntitySlots?)` | Write a whole value. A key with no value gets one and every column counts as new; a key that has one is brought to the value given, and columns the new value does not carry are taken away. **The identity always comes back**, whatever the write changed. |
| `upsertEntities(storeSlot, entities, changedEntitySlots?)` | The loop. Correct at any moment. **Returns the slot of every entity, in input order**, whether or not its write changed anything — so `bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, entityService.slotContentService.upsertEntities(storeSlot, entities))` files every entity. |
| `insertEntity(storeSlot, key, entity, changedEntitySlots?)` | `upsertEntity` under a key you name instead of `keyOf`'s. |
| `insertEntities(storeSlot, entities)` / `fillEntities(storeSlot, keys, entities)` | A **first load only** — refuses unless the store slot is empty, so it checks emptiness once instead of per entity. No `changed`: a first load changes every entity. |
| `writeEntity(slot, entity)` | A whole value through an identity you hold; `false` when nothing changed. |
| `updateEntity(slot, patch)` | Patch through an identity you hold. Only the columns the patch actually moved are routed. |
| `updateEntityColumn(slot, columnName, value)` | One column through an identity you hold, with no patch object to build and walk. |
| `deleteEntityColumns(slot, columnNames)` | Take those columns off the value. |
| `deleteEntity(slot)` | The **value** leaves; the identity stays for as long as anything still refers to it. |
| `deleteEntities(storeSlot, slots)` | The batch form. One change span for the whole batch, like `upsertEntities` — the store slot is named to the channel once for the batch, not once per entity. |
| `clearAllEntities(storeSlot)` | Every value out. Identities something still holds survive without one. |
| `findEntityByKey(storeSlot, key)` | The entity itself rather than the slot. Mints nothing. |
| `markEntityChanged(slot, changedColumns?)` | Report a change you made to `slot.entity` by hand. |

By key, compose the two halves: `const s = entityService.findSlotByKey(storeSlot, key); if (s !== undefined) entityService.slotContentService.updateEntity(s, patch);`.

**Who owns the entity is a strategy you pick, and there are two strategies.** The
writer takes an `entityInsertStrategy` through `TOIMEntityWriterOptions`, so the choice is
made once at construction and costs nothing per write:

| strategy | what lands in the slot | what the caller keeps |
|---|---|---|
| `oimInsertEntityWithoutCopy` — the default | the object you handed in, no copy | the slot's content itself, so your later edits ARE the slot's — report them with `markEntityChanged`; with the in-place writer a later update edits your object |
| `oimInsertEntityWithCopy` | `{ ...entity }`, a **one-level** copy | nothing the engine can see; mutating your object afterwards does nothing |
| `oimInsertEntityWithSanitizedCopy` | a one-level copy with an own `__proto__` key removed | the same; pick it when you insert untrusted JSON (`JSON.parse` of other users' data) |

```typescript
const copiedCardService = createOIMEntityService<Card>(db, {
    keyOf: (card) => card.id,
    entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
});
```

**A copy is one level deep, and no deeper.** A nested object or
array inside the entity is the SAME reference in the slot as in the object you
handed in, under every strategy, so a caller who edits `handed.tags.push(...)` is
editing the slot either way. The copying strategies buy exactly one thing: the top
level of keys cannot be re-pointed behind the engine's back.

Either way the stored entity is reachable as `slot.entity`, and editing **it** is
a supported write, provided you say so afterwards. That is
`markEntityChanged`, below.

### `markEntityChanged`: you moved the columns, so you supply the list

```typescript signature
markEntityChanged(
    slot: TOIMEntitySlot<TEntity, TKey>,
    changedColumns?: readonly (keyof TEntity & string)[],
): void
```

`upsertEntity` and `updateEntity` work out what moved: the writer walks the incoming
value (`oimPatchEntityColumns`, `oimPutEntityColumns`) and puts every column through `sameValueGuard`. A caller who edited the stored object
already knows what moved, and this door takes that answer instead of deriving
it, so there is no patch object, no copy and no per-column comparison.

```typescript
slot.entity!.title = 'two';
cardService.slotContentService.markEntityChanged(slot, ['title']);
```

**The hand mutation needs no cast.** `TOIMEntitySlot` declares
`readonly entity: TEntity | undefined`, and `readonly` forbids replacing the
object, not writing its columns. You still have to narrow the `| undefined`.
`TOIMSlotEditable<TSlot>` is the type that strips `readonly` from the field
itself, which is what assigning `slot.entity` needs.

**The list is the whole point, and leaving it out gives it back.** Named columns
wake and the rest are left alone. With no list, the column owner walks
the slot's entire column store. A column slot lives there only while
something holds it or subscribes to it, since the collection's column owner
drops it the moment neither does, so "watched" is exactly what the store
contains. The convenient overload is therefore the one that brings back a
per-column walk.

**An empty list wakes nothing at all** (not the columns, not the entity, not the
store slot), because `[]` is the caller saying that nothing moved, and the call returns
before the subframe opens.

**It re-stamps emptiness** itself when the list is left out, when the entity is gone, or when
the service recomputes emptiness on a column write. A hand
mutation that emptied the entity would otherwise leave `oimIsSlotEmpty(slot)` saying the
slot has content, and the identity would outlast its value.

**It refuses inside a flush** (`assertWritable` → `OIMChannelService.INSTANCE.assertNotFlushing(channelSlot)`,
the same gate as every other write) and throws on a released identity. Both of
the reporting forms also wake the entity slot and the store slot, so an effect on the
slot sees the change as well as one on a column.

A misspelt column name, a bare runtime `string`, and a slot of a different entity
type are each a compile error, because the parameter is `readonly (keyof TEntity & string)[]`.

**A removal leaves the buckets standing.** A slot does not know which buckets it
is in, so `deleteEntity` cannot take it out of them. A bucket's slots belong to the caller: the
caller who put the slot in a bucket takes it out.

### Which entities actually changed: the `changed` array

```typescript
const payload: Card[] = [];
const reindex = (changedSlot: TOIMEntitySlot<Card, TOIMStoreKey>): void => {};
const changed: TOIMEntitySlot<Card, TOIMStoreKey>[] = [];
cardService.slotContentService.upsertEntities(cards, payload, changed);
for (const changedSlot of changed) reindex(changedSlot);   // the re-sent entities are not in here
changed.length = 0;
```

The array is **optional, yours, and appended to**. The engine never reads it
and never clears it. A slot is pushed exactly when the write put in content different
from what that slot already held, so one array reused across a whole batch comes
out as the list of entities that a bucket pass owes work for. The same parameter
stated by key is `cardService.slotContentService.insertEntity(cards, key, entity, changed)`.

It exists because `sameValueGuard` already refused those writes column by column,
and without this parameter the verdict would stay inside the engine. A consumer that owns a
bucket this engine does not maintain would then re-report every entity of every
re-sent payload. It is an out-parameter rather than a return because the return is taken
by the rule above, and a `{ slot, changed }` record would allocate once per
write on the path this parameter exists to make cheaper. A caller who does not want it pays
one `undefined` compare per write.

One layer down, the slot doors that write a whole content (`writeEntity(slot, entity)`,
`writeBucketMemberSlots(bucketSlot, bucketMemberSlots)`) compute it, and their boolean is **a fact about the content and says nothing about the
identity**: `false` does not mean "this slot may go". That question is answered by `oimIsSlotEmpty(slot)`
and the grace left on the idle window, asked by the release guard.

### The writer is a fork, and both strategies ship

```typescript signature
interface IOIMEntityWriter {
    readonly fillEntity: (slot: TOIMEntitySlot, entity: object) => void;
    readonly putEntity: (slot: TOIMEntitySlot, entity: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchEntity: (slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchColumn: (
        slot: TOIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ) => boolean;
    readonly deleteColumns: (slot: TOIMEntitySlot, names: readonly string[]) => readonly string[];
    readonly clearEntity: (slot: TOIMEntitySlot) => void;
}

createOIMEntityWriterInPlace(options?)       // the stored object keeps its identity
createOIMEntityWriterReplacing(options?)     // every write that changed something produces a new object
// TOIMEntityWriterOptions = { sameValueGuard?: TOIMSameValueGuard; entityInsertStrategy?: TOIMEntityInsertStrategy; putEntityColumns?: typeof oimPutEntityColumns }
```

A writer moves an entity's columns and does nothing else: it reaches no channel,
takes no holds, and knows nothing about lifetime. `deleteColumns` hands back **the
names that actually moved**, or a frozen empty array when nothing did. A
service routes these names to column subscribers, which is why a write that changes
nothing wakes nobody. `putEntity` and `patchEntity` answer whether anything moved
and name the moved columns only into the array they are handed. The content service
hands one only when the slot has changed-column readers (it has column slots, or an
index listens), so a write of an entity that nobody reads by column allocates no names, and
an index wakes a bucket column exactly when a member's value of it changed or left. `sameValueGuard` defaults
to `oimSameValueZeroGuard` and is the per-column comparison that decides "moved".

A writer of your own can reuse the column walks that both shipped writers run,
`oimPatchEntityColumns`, `oimPatchEntityColumn` (one column, behind `patchColumn`) and
`oimPutEntityColumns`. The whole-entity put is itself the writers' `putEntityColumns` option:
`oimPutEntityColumns` is the default and skips neither `__proto__` keys nor inherited stored
columns; `oimPutEntityColumnsGuarded` keeps both guards, at a measured cost on every put, for
values that can carry a `__proto__` key or are class instances
(`createOIMEntityWriterInPlace({ putEntityColumns: oimPutEntityColumnsGuarded })`). Each returns the object
`targetOf` handed back with the moved columns written into it, or `undefined`
when nothing moved, so the writer decides only where the result goes. The
[docs](https://oimdb.org/docs/core/writing#writing-your-own-writer) build one that
stores every value frozen.

`putEntity` is PUT and `patchEntity` is PATCH, as in HTTP. PUT makes the stored
entity the value handed in: columns that changed are written and columns the value
does not have are cleared to `undefined`, in one call, and the names it returns cover both. PATCH writes
only the columns the patch names. `upsertEntity` of a key that has a value and
`writeEntity(slot, entity)` are PUT, so a whole-entity write that drops a column writes
the slot to the channel once, and the replacing writer builds one new object, not
two. This is counted in `src/facade/entity/tests/what-a-put-that-drops-a-column-costs.test.ts`.

Neither writer `delete`s. A column that a PUT drops or `deleteColumns` takes away is
written `undefined`, into the stored object in place or into a spread copy when
replacing, so the entity keeps its hidden class: the key stays in
`Object.keys` and `in`, and the column reads `undefined`. A column holding
`undefined` counts as absent: a later write that leaves it out
does not report it, and taking the entity away does not wake its readers.

The choice is made once, when the entity content service is built (`entityWriter`, else
`db.entityWriter`), so there is no `if (inPlace)` anywhere on any write path; the object already
is the answer. The default is `createOIMEntityWriterInPlace()`. Pass `createOIMEntityWriterReplacing()` when
something downstream compares by reference.

---

## Frames, channels and effects

A channel is the runtime: the frame counter, the revision, and the delivery pass. Its state is a
`TOIMChannelSlot` (the `OIMDB` builds one, `db.defaultChannelSlot`), and its operations are on
`OIMChannelService.INSTANCE`, each handed the channel slot. The options go to the `OIMDB`:

```typescript
const sentReports: unknown[] = [];
const scheduledDb = new OIMDB({
    channelScheduler: (flush) => { void Promise.resolve().then(flush); },
    errorPolicy: new OIMErrorPolicyLogAndContinue({ onError: (error) => { sentReports.push(error); } }),
    onBeforeFlush: () => { /* the flush has begun; read only, no writes */ },
});
```

With no `channelScheduler`, nothing is ever delivered until you call `db.flush()`
yourself. A second independent channel is a second `OIMDB`.

**Errors thrown by effects and handlers go to the error policy.** The default,
`OIMErrorPolicyLogAndContinue`, logs each one with `console.error`, hands it to the
optional `onError` (Sentry, the devtools registry), and finishes the rest of the
flush. `OIMErrorPolicyThrowAtOnce` instead throws the first one out of `flush()`;
effects the frame had not reached stay queued for the next flush. An effect whose
body or cleanup threw has not taken the change it woke for: it is stamped only
after the body returns, so its next wake runs that change again. It is never
re-run inside the frame it threw in, so a body that always throws costs one run
and one caught error per wake, not a loop. A cleanup that disposes its own effect
stops the body that would have run after it. A computed is stamped fresh only after
its derive and its `sameValueGuard` have returned, so a throw in either derives again at
the next read; a computed with no sources derives on its first read. A throw never stops the channel from asking
for frames: the next write after an aborted frame asks for one. A throw in one
release of a sweep leaves the rest of that slice on the release clock for the next
sweep. A release that falls inside a flush (an effect body disposing another
effect) waits: the slot goes to the unused-slot collector and is released once the
flush is over. Code that keeps
derived state (an index's `keyOf`, an emptiness check) is outside the
policy: a throw there leaves state consistent and is thrown in either mode. An
index whose `keyOf` throws on an entity files that entity under no key, finishes the rest
of the write or batch, then rethrows; the next write it accepts files the entity again.

**Subscribing is building an effect.** There is no `subscribe` helper over this,
and there must not be one. An effect is stamped with the channel clock at birth,
so `effectService.createEffect` hears only what moves after it and never delivers a first
value. `effectService.createEffectImmediate(db, roots, computeds, body)` is the door that runs
the body once at creation. An effect is a plain `TOIMEffect` object with no methods (its
channel is `effect.channelSlot`); `OIMEffectService.INSTANCE` does everything to it. There is
one effect service for the whole process, and every door is handed the `db` (any
`IOIMChannelMap`) whose `defaultChannelSlot` the effect runs on.

```typescript
// Sources are named in two lists: root slots, and derivations.
const effect = effectService.createEffect(db, [slot], [totalService.computedCollectionService.getSlotByKey(total, undefined)], () => {});
effectService.disposeEffect(effect);
// The second list is typed `readonly TOIMComputedSlot[]` — pass slots taken from
// a computed service's `computedCollectionService` straight in.

// One column of one slot, woken when that named column moves and by nothing else.
// It takes the COLUMN SLOT, which the column owner mints and holds.
const onRank = effectService.createEffect(db, [cardService.holdColumn(slot, 'rank')], [], () => {});
```

The body's type is `TOIMEffectBody`, which is `() => (() => void) | void`. **A returned
function is the undo**: it runs before the next run of that body and on `disposeEffect`,
so a body that opened something on each run has somewhere to close it.

```typescript
const poll = (): void => {};

effectService.createEffect(db, [slot], [], () => {
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
});
```

The return is checked with `typeof` rather than for truthiness, because an
expression-bodied arrow hands back whatever the expression evaluated to
(`() => set.add(key)` returns the `Set`), and anything that is not a function is
discarded.

**An effect can also find its sources as it reads.** `createEffectWithSourceTracking(db, body)`
takes no source lists: the body gets an `OIMEffectSourceTracker`, and what it reads through
`readSourceSlot(slot)` (which files the slot and returns it) and
`readSourceComputedValue(computedSlot)` (which files the derivation and returns its value)
is what that run depends on. The body's type is `TOIMEffectBodyWithSourceTracking`.

```typescript
effectService.createEffectWithSourceTracking(db, effectSourceTracker => {
    const isFirst = effectSourceTracker.readSourceSlot(slot).entity?.rank === 1;
    console.log(isFirst ? effectSourceTracker.readSourceSlot(slot).entity?.title : 'not first');
});
```

The body runs once at creation, since that run finds the sources. After every run the
effect is subscribed to exactly what it read: a branch not taken is unsubscribed, and a
slot read twice is subscribed once. A run that reads the same sources as the run before
compares each read with the previous one and changes no subscription. `createEffect` is
unchanged; you pick one or the other per effect, at creation.

Here is how an effect is filed:

- **The derivation list is deduplicated.** If you name one computed slot twice in the
  second argument, it gets one edge, not two. Nothing is allocated for
  a list of one or none, and a list that turns out to be distinct keeps the
  caller's array.
- **`dispose` unfiles by a remembered position instead of by scanning.** Each
  effect records where it sits in every list it is on; a removal swaps in the tail
  and tells the moved effect where it now is. *Scanning and splicing instead would make
  taking N subscribers off one identity quadratic in N.* The visible
  consequence is that **a slot's `effects` is not in subscription order.**
- **The moved effect is told by edge, not found by search.** Beside `effects`, a slot
  keeps `effectEdges`: for each effect, which of that effect's sources this slot is.
  The swap carries both, so the moved effect updates one number and never scans its
  own sources. Taking one of two effects off the same N slots reads the other's
  source list zero times, where a search would read it N(N+1)/2 times. Only the slot's
  owner writes either array, in `subscribeToSlot` and `unsubscribeFromSlot`.
- **A subscription is a hold.** `subscribeToSlot` takes one through `holdSlot` and
  `unsubscribeFromSlot` gives it back through `unholdSlot`, so a subscribed slot
  cannot be released and no caller can subscribe without holding. An effect makes
  one owner call per source, not two.
- **A slot's key is written by its owner.** The slot owner mints a slot with
  `slotStoreService.ownKey(key)` (the key itself from the map-driven store, a copy
  of the composite key from the tree-driven one), and the store never writes a slot.

`holdColumn` has a pair: `unholdColumn(columnSlot)` gives the hold back, and
`getColumn(slot, columnName)` reads the same column slot without a hold (a mint is held by
the unused-slot collector until the next flush ends). **The column doors are on the collection
service** (`OIMSlotCollectionService` and `OIMSingleSlotService`), and they reach the slot owner's
column owner (`slotOwnerService.columnOwner`), which holds the column slot store and the column
groups. With `columnNames` named the store is an array by ordinal, otherwise a Map. The column
owner is abstract and has two strategies, chosen by the door that builds the owner:
write-driven column slots (`OIMColumnOwnerPushDriven`), woken by the marks a write makes (entity
and bucket collections, keyed or single), and derive-driven column slots
(`OIMColumnOwnerPullDriven`), each a computed slot over its carrier (`OIMComputedService`, so
`OIMComputedServiceSorted` and `OIMComputedServiceBucketMemo` too, keyed or single; see
[Computed columns](#computed-columns)). A write-driven column slot is a
`TOIMColumnSlot` — `{ carrierSlot, key }` plus the slot fields — and its carrier is
whatever slot it hangs off: an entity slot, or a bucket slot (see
[Bucket column slots](#bucket-column-slots)). Every collection service also has
`getAnyColumn(slot)` / `holdAnyColumn(slot)`, a column slot that wakes on any column write to its carrier.

**The column name is checked against the collection's column names.** An entity collection is
typed on `TOIMEntityColumnName<TEntity>` (or the names given as `columnNames`), so `holdColumn`
and `getColumn` take only the entity's own columns; a bucket collection takes any `string`.
`deleteEntityColumns(slot, columnNames)` on the entity content service is typed the same way.

**A column group is one column slot for several columns.** `cardService.getColumnGroup(['rank', 'title'])`
returns a `TOIMColumnGroup` — `{ key, columnNames }`, the names deduplicated and sorted, one
frozen object per set of names on that service; get it once per view, not per entity.
`cardService.holdColumnGroup(slot, columnGroup)` mints and holds the group's column slot on `slot`,
and `unholdColumn(columnSlot)` gives it back. A write wakes it once if it changes any of the
group's columns and not at all if it changes only others.

**`columnNames` picks the column slot store.** `createOIMEntityService<Card, 'rank' | 'title'>(db, { keyOf, columnNames: ['rank', 'title'] })`
keeps each entity's column slots in an array by column number instead of a `Map` per entity,
which makes an entity's column store cheaper to create and give back; that is what a scrolling view pays.
`holdColumn` and `getColumnGroup` are typed on the named columns, and a slot for any other
column throws. `columnNames` is on the options of every door — entity, bucket, index, computed —
keyed or single. Without `columnNames` the store is the `columnSlotStoreService` option, and the
doors default it to the shared map-driven `OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()`.

### Frame rules

- **Writes are refused for the whole of a flush**, not only while the frame body
  is running. A subscriber is told *during* the frame, on a half-built world, so
  a write from there would land in a frame that is no longer collecting.
  `onBeforeFlush` and the after-each-frame tail are inside the same flush and
  are refused too. `OIMChannelService.INSTANCE.assertNotFlushing(channelSlot)` is the guard. It
  throws on the channel slot's `isFlushing` or `frame.isRunning`, and its message names all three
  phases.
- **A refused write keeps its change pending.** `addBucketMemberSlots` and `removeBucketMemberSlots`
  record a bucket change that waits for the outer batch to close. If something
  delivers that bucket while a frame is running (an entity's subscriber handing the
  list back, which takes `unholdSlot` into `releaseSlotIfUnheld`), the write is refused
  and the bucket stays pending, so the change is delivered when the batch
  closes instead of being lost.
- **A door asks once and then writes without asking again.** `OIMChannelService.write` is
  `assertNotFlushing` plus `writeWithoutFlushCheck`, and a content service door
  that opened with `assertWritable` uses the second directly. The per-entity ask
  cannot be removed: user code (`keyOf`, an index's `keyOf`, `slotEmptiness.isEmpty`, an
  `IOIMEntityWriter`) runs inside the door and can call `flush()`, so each entity is
  a fresh question. `tests/who-may-write-without-asking-the-channel.test.ts` pins
  who may use the door that skips the check.
- **`flush()` inside a frame is refused** for the same reason: a frame inside a
  frame is not nested; it takes the outer one apart. **`flush()` from the tail
  of a flush** is neither refused nor deferred. It returns having done
  nothing, and one flush spends exactly one frame.
- **No door writes from inside a flush.** The handlers of
  `OIMChannelService.INSTANCE.subscribeAfterEachFrame(channelSlot, fn)` and
  `subscribeOnceAfterFrame(channelSlot, fn)`, and `onBeforeFlush`, all run inside it. A
  write in response to a change happens after `flush()` has returned: a tail
  handler hands the work to a microtask or a later callback instead of writing
  itself. A refusal raised from a tail handler goes to the error policy, not out of
  the write call.
- **The frame cannot close while a subframe is open.** A subframe is one logical
  change inside the frame. `OIMChannelService.INSTANCE.openSubframe(channelSlot)` and
  `closeSubframe(channelSlot)` bracket it, and a write that asks for a frame while one is open is owed it by
  the `closeSubframe` that brings the count to zero. **`flush()` called while a
  subframe is open throws** (`a subframe is open`), whether it comes from a `keyOf` or a
  listener that a write runs, or from between a caller's own open and close. Subframes are counted,
  because a subframe is routinely inside another one, and closed from a `finally`,
  so a subframe that threw part-way still delivers what landed. It is not the frame
  guard seen from the other side: that guard refuses a *write* made while a frame closes, while this
  refuses a *frame* asked for while a subframe is open. A content service's write doors open
  a content subframe, which opens the channel's subframe and delivers the content-change
  listeners at its outermost close.
- **Every bucket door wakes the bucket the same way.** Each bucket content service
  door that changed the bucket (adds, removes, positional inserts and removes, both moves,
  `writeBucketMemberSlots`, `clearBucketMemberSlots`)
  files it once and sets the bucket's EMPTY flag at once. The outermost subframe close
  stamps it once, tells the release policy `onSlotWritten` once, then asks whether
  it may go. So `hasSlotContentByKey` is accurate inside an open batch, a batch that mixes
  doors stamps the bucket once, a move renews a write deadline, and a door that
  changed nothing stamps nothing and tells the policy nothing. Commands are still
  recorded at the door, where the position is true.
- **A released identity is refused before the bucket changes.** Every door that
  takes a member checks first whether what it was handed is released (`oimIsSlotReleased`), and throws, so a
  refused door leaves the members, their holds and the EMPTY flag as they were. The check costs one
  field read per member handed in.
- **The span belongs to the door.** `writeBucketMemberSlots`, `clearBucketMemberSlots`, `insertEntities`, `fillEntities`,
  `updateEntity` (when it is more than one channel write) and `markEntityChanged` each open exactly one; the entity writer's `fillEntity`,
  `putEntity`, `patchEntity`, `deleteColumns` and `clearEntity` open none. So one `upsertEntities` opens
  one, and one `insertEntities` opens one however many entities it carries. A write that is exactly
  one channel write opens none, because one write cannot be seen half-done and there is nobody to batch for:
  `upsertEntity` of a new key, `updateEntity`/`updateEntityColumn`/`writeEntity` and `deleteEntity`
  when the store slot has no content listener, no column of the
  entity is read and emptiness is not recomputed on a column write. `deleteEntityColumns`
  always opens one, because it always names the columns it took. The content service's
  `releaseSlotContent` is the exception and keeps its own, because `releaseSlotIfUnheld`
  reaches it from the release queue through no door at all.

### `subscribeOnceAfterFrame` — one frame, and the caller picks which

```typescript
const paint = (card: Card | undefined): void => {};
const measureAndScroll = (): void => {};

effectService.createEffect(db, [slot], [], () => {
    paint(slot.entity);
    OIMChannelService.INSTANCE.subscribeOnceAfterFrame(db.defaultChannelSlot, () => { measureAndScroll(); });
});
```

The handler is told after **one** frame, the first that ends after the call, and is then gone.
**The place where you ask decides which frame that is.** Registered from inside an
effect body, it runs in the tail of that very frame, after every other effect of
it: the after-each-frame phase settles who it owes when the phase *begins*, and
the drain is before that. So a consumer whose work needs the whole settled screen
(a measurement, a scroll to an entity that moved, a size written back) asks from
inside its effect and is answered at the end of that same frame.

It is **not** `subscribeAfterEachFrame` plus a disposal. The effect runs again
next frame and registers again, so a standing handler accumulates one more per run:
`src/engine/channel/tests/a-handler-that-wants-one-frame-and-not-every-frame.test.ts` measures the
one-shot at 1, 2, 3 calls over three frames against the standing handler's 1, 3,
6. The one-shot handler also comes off *before* its body runs, so a handler that throws is not left
standing for the next frame.

If you register it from the after-each-frame phase itself, it sits that frame out and is
told after the next one, because the phase had already settled who it owed. There is no
second list: one-shot and standing handlers share the set and are called in
registration order.
- **Delivery is coalesced per identity per frame.** However many writes touched a
  slot, its effects run once.
- **A derivation is asked, never woken.** Nothing schedules a computed slot;
  it settles when whoever wants its value asks for it.

### Ending the channel whole

```typescript
OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot);   // then drop your own references
```

**The precondition is the caller's: nothing may be subscribed to anything in this
channel.** The engine does not check it, and cannot do so cheaply: checking means
asking every slot for its `effects` list, which is the walk the call exists to
skip. The check *is* the cost.

It sets the channel slot's `dropped` flag, cancels a scheduled frame, flushes the
unused-slot collector (unless a flush is running), empties the queued effects, the
after-each-frame handlers and the after-each-flush handlers, and returns. **Nothing walks a slot to ask who
is subscribed to it.** Every slot, store and derivation under the channel becomes
garbage together once your references go. The collector is the exception because
it is the channel's own debt: a getter that minted an identity filed a hold there,
`flush()`'s `finally` is the only thing that gives those back, and a dropped
channel returns on the flag before reaching it. A drop that skipped the
collector would pin those identities for as long as the collector lives. The
flag is there because `TOIMChannelScheduler` hands back no handle, so a frame asked for
before the call still arrives, and `flush()` returns on the flag instead of
delivering a torn-down screen.

**The flag is read in two places.** `flush()` returns on it, and so does the
private `requestFlush`. `write` reaches `requestFlush` at the end of every write that got
past the per-frame coalescing guard with at least one dependent to schedule, and
`scheduleEffectRun` reaches it when `createEffect` finds a source that
already moved in the open batch. That second read is what stops a dropped screen
from scheduling work on its host for as long as anything still writes to it.

So a write after the call is **neither refused nor unnoticed**: it
advances the clock, stamps the slot and schedules the dependents it finds, and then
asks for no frame, so nothing it scheduled is ever delivered.

If you call it with subscribers still standing, their bodies never run again, with no throw
and no report; that is the bargain the name states. There is no checked sibling,
and checking is not an option on this one. It is **not** a manual release of a slot:
that stays refused, and nothing may ask for one slot to go.

---

## Buckets: the slots are the caller's

A **bucket** is an identity whose content is other identities. A
**bucket collection** (`createOIMBucketService`) files buckets by key, in each store slot it
creates, and its `slotContentService` holds each bucket's member slots. It is **manual by default**, and that
is a claim about what a bucket's slots ARE; it is not a missing feature. They are
a fact about the **response** a caller is composing (a search result, a page, a
window), and no column can express absence.

A bucket holds bucket member slots of any slot type (entity slots, bucket slots,
computeds), and the bucket's type parameter is that slot type,
`TBucketMemberSlot extends TOIMSlot` (default `TOIMEntitySlot`). An auto-index's
`getEntitiesByKey` is there because its members are entity slots.

```typescript
const byDeckService = createOIMBucketService<
    CardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<CardSlot>, OIMSlotContentBucketServiceSetDriven<CardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<CardSlot>() });
const byDeck = byDeckService.createStoreSlot(db);

const aceSlot = cardService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'red', title: 'Ace', rank: 1 });
const kingSlot = cardService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'red', title: 'King', rank: 13 });

const red = byDeckService.holdSlotByKey(byDeck, 'red');
const deckContentService = byDeckService.slotContentService;
deckContentService.writeBucketMemberSlots(red, [aceSlot, kingSlot]);
db.flush();

for (const cardSlot of deckContentService.getBucketMemberSlots(red)) { console.log(cardSlot.entity?.title); }
deckContentService.getBucketMemberSlotCount(red);

deckContentService.clearBucketMemberSlots(red);
red.owner.unholdSlot(red);
```

The store slot carries the keyed store: there is no `buckets` property to reach
through, and `holdSlotByKey(byDeck, key)` hands back the bucket itself instead of a
`{ slot, release }` record. The door's optional `slotReleasePolicy` decides whether and when
its buckets go; `OIMSlotReleasePolicyAtUnhold.INSTANCE` drops a bucket at the last give-back.

`writeBucketMemberSlots` is idempotent: when you re-send an unchanged list, the
content service compares it (it is the only object that knows whether the caller's order is part
of what it holds at all) and returns without evicting anything.

### Which door: you hold the answer, or you hold the delta

`writeBucketMemberSlots` is for a caller who has **the list that should be there** and does not
know what changed: a search result, a page from a server, a filter re-run. Its
cost is proportional to **what the bucket holds**, not to the change. The
difference builds a map over the whole incoming list and walks the standing one,
so writing ten entities into a bucket of two hundred pays for two hundred and ten.

`addBucketMemberSlots(bucketSlot, entitySlots)` and `removeBucketMemberSlots(bucketSlot, entitySlots)` are for a caller who
**knows the delta**: an entity arrived over a socket, a card was dragged in, a page
was appended, an entity was deleted. The standing slots keep the holds they already
have. Each wakes subscribers once, and neither wakes anybody when nothing joined
or left.

Adding costs what you name. Removing k slots from an ordered bucket of n is one
pass, n + k, through the content service's protected `removeSlots(bucketSlot, slots, removed,
removedAt)`. This is the erase–remove idiom, as in Java's ArrayList.removeAll; k separate
removals cost up to k·n. The `remove` commands come in list order, each at its
position after the earlier ones were applied, so replaying them draws the same list. A
set-driven bucket removes in the order you name.

**`addBucketMemberSlots` removes nothing.** If the authoritative list shrank and you call
`addBucketMemberSlots`, the entities that left stay in the bucket, held. Not knowing what left is
exactly when `writeBucketMemberSlots` is the right door, and its cost is the price of not
knowing.

The content service commits the list through its protected
`reconcileSlots(bucketSlot, slots, arrived, departed)`, which is the
reconciliation pattern (diff, then patch). Empty `arrived` and `departed` mean
nothing changed, and the write wakes nobody. The array-driven content service compares the
sequence first: the same slots in the same order change nothing, and any other
sequence, a reordered one included, is drained and re-added whole. The
set-driven content service takes the set difference and never rebuilds. The two queues are the
channel's, so a steady frame allocates nothing for the answer.

**The frame is not a parameter anywhere.** `reconcileSlots` and `drainSlots(bucketSlot, departed)`
declare no frame argument.

No frame number reaches a bucket content service, and none is stamped on a render script.
`OIMBucketCommands` records onto the bucket slot (`bucket.commands`) as the writes land and
empties it once the flush has fully ended, so a script can only ever describe the
frame a consumer was woken for. A bucket written after that frame (from an
after-each-frame handler) keeps its script for the next one: the reset clears only a script
whose `commandsStartedAtRevision`/`commandsStartedAtEpoch` is older than the reading the
channel slot's last frame opened at. `clearBucketMemberSlots` drains the bucket first and
marks it changed only when the drain removed something, so an already-empty bucket records
nothing for a call that reports nothing.

The **channel slot** is what a bucket collection tells, and it is required: every store slot
is created on a `db` and reaches its channel slot through `storeSlot.channelSlot`, so there is no
strategy that tells nobody. `OIMChannelService.INSTANCE.write` carries the frame guard, which is
why a whole-bucket write cannot report from inside a flush.

### How a bucket holds its slots is a fork with two strategies

| Content service | Storage | One `addBucketMemberSlot` records |
|---|---|---|
| `OIMSlotContentBucketServiceSetDriven` | `Set` | one per slot |
| `OIMSlotContentBucketServiceArrayDriven({ bucketArrayMembership?, bucketCommands? })` | list, plus whatever the list adds | the ordered list's answer |
| `OIMSlotContentBucketServiceSortedArrayDriven({ compareBucketMemberSlots })` | list ordered by the comparator (`sortedCount` marks the sorted prefix) | one per mention |

The positions are the caller's. No read re-decides the order, and the position
doors below are the only way the list moves.

### And what naming a slot RECORDS is the array-driven service's own fork

| Ordered list | Storage it builds | One `addBucketMemberSlot` counts |
|---|---|---|
| `OIMBucketArrayMembershipNonUnique.INSTANCE` (the default) | `TOIMBucketSlotsArrayStore` | one per *mention* — a slot named twice is two |
| `new OIMBucketArrayMembershipUnique()` | `TOIMBucketSlotsArrayUniqueStore` (list + `Set`) | one per slot, order kept |

```typescript
const dedupedContentService = new OIMSlotContentBucketServiceArrayDriven<
    CardSlot, TOIMBucketSlotsArrayUniqueStore<CardSlot>
>({
    bucketArrayMembership: new OIMBucketArrayMembershipUnique<CardSlot>(),
});
```

`IOIMBucketArrayMembership` is `createStore`, `addSlot`, `removeSlot`, `hasSlot`, `clearSlots`,
`containsTheSameSequence`. Only the array-driven content services take one. Their
`hasBucketMemberSlot` asks the membership's `hasSlot`: `OIMBucketArrayMembershipUnique` answers
from its `Set`, `OIMBucketArrayMembershipNonUnique` walks the array.

### Positions the caller decides, and the commands that record them

`createOIMBucketService<CardSlot>(db)` with no `slotContentService` is the bucket collection to
take when the positions are yours: its default content service is
`OIMSlotContentBucketServiceArrayDriven` with an `OIMBucketCommands` recording over it.

The position doors follow; a position they return is valid only until the next write. The reads
`getBucketMemberSlotAt(bucketSlot, index)` and `getBucketMemberSlotPosition(bucketSlot, entitySlot)`
belong to the array-based content services, and the five writes to
`OIMSlotContentBucketServiceArrayDriven` (`OIMSlotContentBucketServiceSetDriven` has none of
them, because a `Set` has no place to name, so asking one does not compile):
`insertBucketMemberSlotAt(bucketSlot, at, entitySlot)`, `removeBucketMemberSlotAt(bucketSlot, at)`,
`removeBucketMemberSlotRange(bucketSlot, at, count)`, `moveBucketMemberSlotToPosition(bucketSlot, from, to)` and
`moveBucketMemberSlotRangeToPosition(bucketSlot, from, count, to)`. Each runs inside
the frame guard, takes the holds and records the report. `insertBucketMemberSlotAt` clamps `at` to the ends
of the list; `moveBucketMemberSlotToPosition` refuses `from === to` and either end out of
range; `moveBucketMemberSlotRangeToPosition` reads its landing in the list **without** the run
in it. A position or count that is `NaN` or a fraction throws before anything
moves; `±Infinity` clamps. The default ordered slot list records one place per *mention*, so
inserting a slot the bucket already holds gives it a second position. Hand the
content service an `OIMBucketArrayMembershipUnique` when a position must name one entity; a
repeat insert into it changes nothing and records nothing.

The content service's protected `removeSlot(bucketSlot, slot)` hands back a `number`: WHERE
the slot was. A removal already has to find the slot, so nothing asks
`getBucketMemberSlotPosition` for an index that the removal already computed. Two of the
answers are not positions, and both are exported:

| returns | means |
|---|---|
| `0` and up | the index the slot occupied, now vacated |
| `OIM_NOTHING_WAS_REMOVED` (`-1`) | the bucket did not hold it; nothing changed |
| `OIM_REMOVED_WITHOUT_A_POSITION` (`-2`) | removed from a store that keeps no positions, which is the set-driven service |

`removeBucketMemberSlot` turns the third into `recordWholeList`: a set has no index to
patch, so the consumer is told to re-read rather than handed a fabricated one.

`insertBucketMemberSlotAt` records the index the slot LANDED on (`at` clamped to the ends of
the list). **The landing is not `getBucketMemberSlotPosition(bucketSlot, slot)`**: the default
ordered list keeps one place per *mention*, so inserting a slot the bucket already holds gives
it a second position, and the position read names the first. A script built from that read
there tells the consumer to patch where the slot is not, and the consumer's list diverges
from the bucket's for good.

`OIMBucketCommands` records onto the bucket slot what those writes DID, so a
consumer patches instead of rebuilding:

```typescript
const pageService = createOIMBucketService<CardSlot>(db);
const page = pageService.createStoreSlot(db);
const bucket = pageService.holdSlotByKey(page, 'p1');

const rebuildFrom = (slots: Iterable<CardSlot>): void => {};
const applyToTheRenderedList = (commands: readonly TOIMOrderedListCommand[]): void => {};

effectService.createEffect(db, [bucket], [], () => {
    if (bucket.isWholeListRecorded) rebuildFrom(pageService.slotContentService.getBucketMemberSlots(bucket));
    else applyToTheRenderedList(bucket.commands ?? []);
});
```

The content service already writes the bucket slot on every mutation, so the consumer
subscribes to the bucket. `TOIMBucketSlot` carries two fields that a consumer reads:
`commands`, a `readonly TOIMOrderedListCommand[]` (or `undefined` before the first
write) of what this frame's writes did, in order, and
`isWholeListRecorded`, which says the script was abandoned and the bucket's slots
are the answer. **Both are reset once the flush has fully ended**, so they are
read inside the frame (from an effect body or a `subscribeAfterEachFrame`
handler), and there is no "commands since frame N": a consumer that did not read
this frame's script reads the list instead. A script carries the clock reading it
started at (`commandsStartedAtRevision`/`commandsStartedAtEpoch`) and is stale once
a frame has opened after it (`channelSlot.frame.openedAtRevision`/`openedAtEpoch`). The
recorder clears a stale script before recording into it, so a write that lands after a
flush, ahead of the recorder's reset, starts a new script instead of extending one
that was already read. `isWholeListRecorded` is set by a write
of the whole bucket (`writeBucketMemberSlots`, `clearBucketMemberSlots`, `moveBucketMemberSlotRangeToPosition`), by a
removal from a bucket whose content service keeps no positions and so has no index to
patch, and by
the script outgrowing the list it describes. `maxCommandsPerSlot` on
`TOIMBucketCommandsOptions` (and on `createOIMBucketService`'s options) is that ratio. It defaults to
`OIM_MAX_COMMANDS_PER_SLOT`, which is 1, the same ratio
`oimOrderedListCommandsOfTransition` takes as `maxCommandsPerSlot`. A consumer that animates moves cannot
use a whole-list answer, because it costs them every move they were going to animate.
They pass `Infinity` to be handed every command instead, however long the script
grows.

**Recording is chosen when the content service is built.** `bucketCommands` on
`TOIMSlotContentBucketServiceOptions` is read once into a readonly field:
`new OIMBucketCommands({ maxCommandsPerSlot })`. If you leave it out, the content service holds
`OIMBucketCommandsNone.INSTANCE`, whose methods are empty and take positions instead of a
command object, so a bucket that nobody renders positionally allocates no command. There is no
setter, so a second recorder cannot silently replace the first. The first script recorded on a
channel slot subscribes one reset to `OIMChannelService.INSTANCE.subscribeAfterEachFlush` for
that channel slot; it walks only the store slots that recorded a script.

The bucket's own type says which storage it carries
(`TOIMBucketSlot<TOIMBucketSlotsArrayStore<CardSlot>>`, reached as `bucket.bucketSlotsStore`), so handing
a set-driven bucket to the array-driven content service is a compile error. A content service holds no
per-bucket state, so **one instance may serve two bucket collections**.

### The other strategy: an index that fills itself

```typescript
const indexService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,        // which key an entity belongs to
});
const index = indexService.createIndexStoreSlot(cards);

const render = (slots: unknown[]): void => {};

const spades = indexService.holdSlotByKey(index, 'spades');   // the hold mints the bucket and fills it
effectService.createEffect(db, [spades], [], () => render(Array.from(indexService.slotContentService.getBucketMemberSlots(spades))));
```

It **is** a bucket collection (`OIMIndexService` extends `OIMSlotCollectionService`), and
`createIndexStoreSlot(cards)` makes its store slot for one entity store slot and files every
entity of it into the buckets on write, from `keyOf`. You read through the index service
(`getSlotByKey`, `holdSlotByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, `getSlots`,
`getSlotCount`, `getEntitiesByKey`, each with the index store slot first) and through its
`slotContentService` on a bucket slot (`getBucketMemberSlots`, `getBucketMemberSlotCount`,
`hasBucketMemberSlot`, and on an array-based content service `getBucketMemberSlotAt` and
`getBucketMemberSlotPosition`). That `slotContentService` is narrowed to those reads, so the
index's buckets cannot be written from outside. The default content service is
`OIMSlotContentBucketServiceArrayDriven`; pass `slotContentService:
new OIMSlotContentBucketServiceSetDriven()` for buckets that keep no positions. Passing
`entityService` and then the entity store slot is the whole wiring: `createIndexStoreSlot(cards)`
registers a content-change listener on that store slot
(`OIMContentChangeListenerService.INSTANCE.addContentChangeListener(cards, …)`), and the entity
service knows nothing about indexes.
`disposeIndexStoreSlot(index)` takes that listener off, empties the buckets and gives back every
entity held. After that, `getSlotByKey` and `holdSlotByKey` throw, but the two give-backs
(`slot.owner.unholdSlot`, `indexService.unholdColumn`) still take back a hold
that was given out before it.

The bucket wakes on **membership only**, meaning an entity joining or leaving. For "any member's
content changed", the index also hands out the bucket's any-column slot
(`getAnyBucketColumnByKey(index, key)` / `holdAnyBucketColumnByKey(index, key)`, given back with
`indexService.unholdColumn`). It wakes when a member's content changes, and a member
joining or leaving is not its business. A reader that wants both subscribes to the
bucket slot and the any-column slot. **The any-column slot is not the recommended
path for rendering**, because one edit of one entity wakes the whole list. Subscribe the list
to the bucket and each entity to its own slot. The any-column slot costs
something only while somebody holds or subscribes to it.

Batch doors (`upsertEntities`, `insertEntities`/`fillEntities`, `deleteEntities`,
`clearAllEntities`) notify the index once per batch. The index groups entities by key and moves each
group with one bucket write.

Know these four things before choosing it:

- **No bucket exists for a key until it is minted.** A bucket minted through any
  door (`getSlotByKey`, `holdSlotByKey`, `getSlotsByKeys`, `holdSlotsByKeys`) is filled from the source
  entities written before it, without a flush, so minting inside an effect body does not
  throw. `getSlotsByKeys` / `holdSlotsByKeys` fill all new buckets in ONE pass over the source. How long the bucket lives then is the
  collection's ordinary business: the `slotReleasePolicy` option, or `db.slotReleasePolicy`
  when you name none; with neither, the bucket is kept for good. `OIMSlotReleasePolicyAfterIdle`
  cools it on the queue, and `OIMSlotReleasePolicyAtUnhold.INSTANCE` ends it at
  the last give-back. The index injects no lifetime of its own.
- **The key comes from `columns`, `keyOf`, or both**, the same pair as the sorter's
  `sortColumns` / `comparator`. The key type is inferred from the columns (`TOIMIndexKey`):
  `{ columns: ['deck'] }` is keyed by that one column's value and refuses an array;
  `createOIMIndexServiceByCompositeKey(db, { entityService, columns: ['deck', 'suit'] })` is keyed by the
  tuple of their values and builds the bucket collection on a tree-driven store
  (`OIMSlotStoreServiceTreeDriven`) by itself, while `createOIMIndexService` without a
  `bucketSlotStoreService` refuses two columns. When the index asks
  whether a key moved, it asks its own `isSameKey(key, otherKey)`, which
  every collection answers from its own slot store service.
  `{ keyOf }` is any function, read again on every write. With `{ keyOf, columns }`,
  the columns are the ones `keyOf` reads. With `columns`, a patch or put that changes
  none of them keeps the entity's key and calls nothing; a write of the whole value
  always reads the key again.
- A write that reads the key costs, per index, one key read and one comparison
  against the key the entity was last filed under. Only a key that MOVED touches a
  bucket, and a key that nobody holds is not even looked up.
- **Order is not the bucket's business.** A bucket keeps the order its slots
  arrived in. A sorted list is a computed over the index, and two readers who
  want two orders of one key build two of them over the one index.

### A sorted list is a computed over an index

```typescript
const indexService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const index = indexService.createIndexStoreSlot(cards);

const byRankInDeckService = createOIMComputedServiceSorted({
    indexService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const byRankInDeck = byRankInDeckService.createSortedStoreSlot(index);

const spades = byRankInDeckService.computedCollectionService.holdSlotByKey(byRankInDeck, 'spades');
effectService.createEffect(db, [], [spades], () => { console.log(spades.computedValueService.getValueForSlot(spades).map((entitySlot) => entitySlot.entity?.title)); });
spades.owner.unholdSlot(spades);
```

`createOIMComputedServiceSorted({ indexService, sortColumns?, comparator?, slotReleasePolicy? })`
takes no `db`: its store slot is created from the index store slot and runs on that one's
channel slot. It returns an `OIMComputedServiceSorted`, whose
`createSortedStoreSlot(indexStoreSlot)` makes one store slot over one index store slot. Its doors
are on its `computedCollectionService`: `getSlotByKey`, `holdSlotByKey`, `findSlotByKey`, each
with that store slot first. A key's value, read with
`computedSlot.computedValueService.getValueForSlot(computedSlot)`, is that key's entity slots,
sorted. `indexService` is the `OIMIndexService` whose buckets it sorts.

- `sortColumns` is `readonly TOIMSortColumn<TEntity>[]`, each `{ column, direction: 'asc' | 'desc' }`.
  `column` is a `TOIMSortableColumnName<TEntity>`, meaning a column whose values are strings,
  numbers or bigints. **Columns decide which writes re-sort.**
- `comparator` is `(left: TEntity, right: TEntity) => number`. **It decides the order.**
  Without it, the order is `oimColumnsComparator(sortColumns)`: the columns in turn, with an
  undefined or null value last.
- With only `comparator` and no `sortColumns`, any write to a member re-sorts, because nothing
  says which columns the comparator reads.
- With neither, a member keeps the place it first took, and an arrival is appended.
- With both, `comparator` orders, and `sortColumns` is the list of columns whose change wakes
  the sort. **List every column the comparator reads**: a change to a column it reads but
  `sortColumns` omits does not re-sort. Use both when the order needs a rule
  `oimColumnsComparator` cannot express (a locale compare, a tie-break) and the sort
  should still wake only for the columns that rule reads.
- `slotReleasePolicy` (default `OIMSlotReleasePolicyAtUnhold.INSTANCE`) decides whether a key's
  list outlives its last hold. `OIMSlotReleasePolicyNever.INSTANCE` keeps every key ever
  read and re-sorts only on a read that finds it changed, which suits a view that switches
  between groups. Give the index the same policy, or its bucket is rebuilt instead.

It re-sorts only when the bucket's membership changed or a write changed one of
its columns on a member. Its sources are the bucket slot of the key plus one
[bucket column slot](#bucket-column-slots) per column (or the bucket's any-column
slot when only a comparator is given), so a write that touches no sort column
does not re-derive it. It is a computed: it is pulled and re-derived on the read that asks,
and an effect subscribes to it as to any other derivation. A derived value that
compares equal by `oimSameSlotSequence` keeps the previous array.

### A sorted index: sorted at write

The other strategy keeps the index's own buckets in order, so a read needs no computed.
The consumer picks one at construction.

```typescript
const cardsByDeckService = createOIMIndexServiceSortedArrayDriven(db, {
    entityService: cardService,
    columns: ['deck'],
    sortColumns: [{ column: 'rank', direction: 'asc' }, { column: 'id', direction: 'desc' }],
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const spades = cardsByDeckService.holdSlotByKey(cardsByDeck, 'spades');
Array.from(cardsByDeckService.slotContentService.getBucketMemberSlots(spades));
```

`createOIMIndexServiceSortedArrayDriven(db, { entityService, columns? | keyOf?, sortColumns, slotReleasePolicy?, bucketSlotStoreService? })`
returns an `OIMIndexServiceSortedArrayDriven`, whose content service is an
`OIMSlotContentBucketServiceSortedArrayDriven`. `sortColumns` is the same `readonly TOIMSortColumn<TEntity>[]`
that `createOIMComputedServiceSorted` takes.

- Writes append to an unsorted tail of the bucket; the first read settles it, by binary
  insertion for a short tail or by one sort for a long one.
- The index re-files a member when one of its sort columns changes, and only then.
- `getBucketMemberSlots`, `getBucketMemberSlotAt` and `getBucketMemberSlotPosition` answer in order.
- The bucket has no positional writes, and its bucket commands are always `OIMBucketCommandsNone.INSTANCE`.
- Sort-at-write suits point updates, where a rank change re-files one member. Sort-at-read
  (`createOIMComputedServiceSorted` over any index) suits bulk loads.

### Bucket column slots

An index exposes one column slot per bucket and column:
`getBucketColumnByKey(indexStoreSlot, key, columnName)`, `holdBucketColumnByKey(indexStoreSlot, key, columnName)` and
`indexService.unholdColumn(columnSlot)`. The carrier of such a `TOIMColumnSlot` is the
bucket slot, and it is written when a write changes that column on any member of the
bucket. `markBucketColumnsChanged(bucketSlot, patch, changedColumns)` on the bucket content
service is the door the index calls, and the door for whoever changes the members of a
bucket slot they hold, a single bucket's included. The read side of this is the
`OIMIndexService`: it carries its buckets' doors, the bucket column slot doors and the
bucket any-column slot doors (`getAnyBucketColumnByKey(indexStoreSlot, key)`,
`holdAnyBucketColumnByKey(indexStoreSlot, key)`; both are given back with
`indexService.unholdColumn`), and its `slotContentService` carries the member reads,
the positional ones of the array-based kinds included.

```typescript
const decksService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const decks = decksService.createIndexStoreSlot(cards);

const rankOfSpades = decksService.holdBucketColumnByKey(decks, 'spades', 'rank');
const onRankInSpades = effectService.createEffect(db, [rankOfSpades], [], () => {});
effectService.disposeEffect(onRankInSpades);
decksService.unholdColumn(rankOfSpades);
```

### Index keys strategy

Each indexable entity slot carries, per index, the key it is filed under now, so a moved entity
leaves its old bucket in O(1). Only an index writes it, through its `IOIMIndexKeysService`
(`get(slot, position)`, `set(slot, position, indexKey)`), at the position its index store
slot was given (`TOIMIndexStoreSlot.indexKeysPosition`, allocated from the source store slot's
`indexKeysPositions`). Choose the service with the `indexKeysService` option of `OIMDB`; every
index the factories build on that `db` takes it (default `OIMDefaults.INDEX_KEYS_SERVICE.getValue()`).

- `OIMIndexKeysServiceAppending` (default): a disposed index's position is never
  reused, and its stale entry stays on each entity slot. A slot's `indexKeys` grows to the highest
  position any index wrote on it, so after K indexes are made and disposed, a slot the
  last one filed carries an array of K, and a stale entry keeps its key value
  reachable. A write pays nothing for a disposed index: the store slot keeps only the
  live listeners, in the order they were added.
- `OIMIndexKeysServiceReclaiming`: on dispose, it wipes that position on every entity slot of the
  source store slot (O(N)) and reuses it.

Switch to `OIMIndexKeysServiceReclaiming` only if you create indexes dynamically and often.
Creating indexes that way is expensive; better not to.

### Rendering an ordered bucket

```typescript setup
const orderedBucketsService = createOIMBucketService<CardSlot>(db);
const orderedBuckets = orderedBucketsService.createStoreSlot(db);
```

```typescript
const bucket = orderedBucketsService.holdSlotByKey(orderedBuckets, 'spades');
const whatIRendered: CardSlot[] = [];

for (const command of oimOrderedListCommandsOfTransition(whatIRendered, Array.from(orderedBucketsService.slotContentService.getBucketMemberSlots(bucket)))) {
    switch (command.type) {
        case 'insert': /* command.index, command.slot */ break;
        case 'remove': /* command.index */               break;
        case 'move':   /* command.from, command.to */    break;
        case 'reset':  /* command.slots */               break;
    }
}
```

`whatIRendered` must be a snapshot taken where you rendered, never the value
`getBucketMemberSlots` handed you. `getBucketMemberSlots` returns the bucket's live list, which is why it
is typed `Iterable` and not an array. A `prev` kept live is the same array as `next`
on the following frame, so the diff comes back empty, no reorder is ever drawn,
and nothing throws. Keep the `Array.from(...)` copy, or subscribe to
`createOIMComputedServiceBucketMemo`, whose value is a fresh array on every write
that changed the list and the same array while it did not.

A list may name one slot twice: `OIMBucketArrayMembershipNonUnique`, the default strategy
of `OIMSlotContentBucketServiceArrayDriven`, records every mention. The mentions of one identity
are matched in the order they appear, and the script reproduces the new list
mention for mention. The minimal move count is claimed for lists whose identities
are distinct.

`oimOrderedListCommandsOfTransition` is a free function and not a method on `OIMChannelService`, because a bundler
cannot drop a class's methods one at a time, and every consumer imports the
channel service.

---

## Derivations

```typescript setup
const totalService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    sameValueGuard: oimSameValueZeroGuard,         // did the value move?
});
const total = totalService.createComputedStoreSlot(
    db,
    () => slot.entity?.rank ?? 0,
    () => ({
        sourceSlots: [slot],                // root slots it reads
    }),
);
const totalSlot = totalService.computedCollectionService.getSlotByKey(total, undefined);
```

`createSources` returns `sourceSlots` (root slots it reads) and `sourceComputeds` (derivations it reads). Both keys are optional; a missing one means none.

A derivation is a slot that nothing ever marks: it is **asked**, not woken. Its
shape is `TOIMComputedSlot<TValue, TKey>` (`value`, `sourceSlots`,
`sourceComputeds`, `ranAtRevision` / `ranAtEpoch`, `checkedAtRevision` /
`checkedAtEpoch`, `isDeriving`, `allRootSlots`, `owner`, `computedValueService`), and its
`computedValueService` is the only writer of its value. That service holds the
`sameValueGuard` once and serves the value; the derive function and `createSources` come
from the options or from `createComputedStoreSlot(db, derive?, createSources?)`, which keeps
them on the store slot (`TOIMComputedStoreSlot.derive` / `.createSources`); a store slot that
ends up with neither of a pair throws at creation. `createOIMComputedService` takes no `db`:
the store slot is what is created on one. A
derivation slot takes a counted hold on each source it named
(its `sourceSlots` and its `sourceComputeds`) and gives them back when it
goes, so a chain keeps itself one level at a time. The
holds are the owner's, taken when it mints the slot. A chain
short-circuits: `filter → sort → page` over quiet roots is a walk of integer
comparisons, and a chain whose roots changed derives only the levels whose
inputs actually changed.

**A source computed is a slot taken from its own service.** Every source list in
this engine (`createEffect`'s second argument, and `sourceComputeds` in
`createSources`) is typed `readonly TOIMComputedSlot[]`, so a typed slot goes in as
it is. Inside `derive`, `computedSlot.value` is the previous value:

```typescript
effectService.createEffect(db, [], [totalSlot], () => { console.log(totalSlot.computedValueService.getValueForSlot(totalSlot)); });
```

### One derivation per key

```typescript setup
const ranksService = createOIMComputedService<TOIMStoreKey, number>({
    createSources: (id) => ({ sourceSlots: [cardService.getSlotByKey(cards, id)] }),
    derive: (computedSlot) => cardService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
    sameValueGuard: oimSameValueZeroGuard,
    initialValue: -1,
});
const ranks = ranksService.createComputedStoreSlot(db);
const rankCollectionService = ranksService.computedCollectionService;
```

```typescript
const rank = rankCollectionService.holdSlotByKey(ranks, 'c1');        // minted once, same object while held
rank.computedValueService.getValueForSlot(rank);                      // settles, then answers
rankCollectionService.getSlotByKey(ranks, 'c9');                      // minted if 'c9' had none; the collector tracks the mint
rank.owner.unholdSlot(rank);
```

**`createSources` takes the key and the store slot, and nothing else. There is no `keep`.** The holds a filed
derivation carries are the ones it NAMED. The service's mint
holds every entry of `sourceSlots` and `sourceComputeds`, and
the content strategy's `releaseSlotContent` gives all of them back. So the source list IS the dependency
list, and a source that a build closes over without naming is a source that nothing holds.

A derivation is never empty: `OIMSlotContentComputedStrategy.isSlotEmpty` answers `false`,
so a filed derivation goes only when nothing holds it,
nothing watches it, and the grace is `0`. That is what
`OIMSlotReleasePolicyAtUnhold.INSTANCE` answers, and it is the default when no `slotReleasePolicy` is given.
A derivation let go of while the channel is flushing is not released on the spot. It is
handed to the channel's unused-slot collector and released when the flush ends, the same
deferral that every other non-empty slot gets.
`createOIMComputedService` takes a `slotReleasePolicy` as an optional key of its options object.

`createOIMComputedService` is `OIMComputedService` with its generics
inferred and its computed slot store service filled with a map-driven one unless you pass
`computedSlotStoreService`, which a `void` key requires (`OIMSlotStoreServiceSingleSlotDriven`); both are exported.

### Computed columns

A computed's value can be subscribed to by field. On the `computedCollectionService` of
`OIMComputedService` (and of `OIMComputedServiceSorted` and `OIMComputedServiceBucketMemo`),
keyed or single, where a single takes `getSlotByKey(storeSlot, undefined)` as the slot, sit `getColumn(slot, columnName)`, `holdColumn(slot, columnName)`,
`getColumnGroup(names)`, `holdColumnGroup(slot, group)`, `unholdColumn(columnSlot)` and the any-column
pair `getAnyColumn(slot)` / `holdAnyColumn(slot)`. Column
names are typed as the keys of the value.

Each column slot is a computed slot over the carrier computed, its value `carrier.value[column]` (a tuple of
the group's fields for a group, ordered by the sorted column names; the whole value for the any-column), compared with `Object.is`. It is a
`TOIMComputedColumnSlot` (`TOIMComputedSlot<unknown, string>`), so it goes in the SECOND array of
`createEffect`, and it wakes an effect only when that field of the derived value changes.

```typescript
type TCardSummary = { top: number; count: number };
const cardSummaryService = createOIMComputedService<void, TCardSummary, TOIMSingleSlotStore<TOIMComputedSlot<TCardSummary, void>>>({
    computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<TCardSummary, void>>(),
});
const cardSummary = cardSummaryService.createComputedStoreSlot(
    db,
    () => ({ top: slot.entity?.rank ?? -1, count: cardService.getSlotCount(cards) }),
    () => ({ sourceSlots: [slot] }),
);
const summaryCollectionService = cardSummaryService.computedCollectionService;
const topColumn = summaryCollectionService.holdColumn(summaryCollectionService.getSlotByKey(cardSummary, undefined), 'top');
const onTop = effectService.createEffect(db, [], [topColumn], () => { console.log(topColumn.value); });
effectService.disposeEffect(onTop);
summaryCollectionService.unholdColumn(topColumn);
```

### The order of a bucket is one of those derivations

Subscribe to the DERIVATION instead of the bucket when a consumer wants the
list as an array it can compare by identity:

```typescript
const orderService = createOIMComputedServiceBucketMemo({
    bucketCollectionService: orderedBucketsService,
});
const order = orderService.createBucketMemoStoreSlot(orderedBuckets);
const render = (slots: readonly CardSlot[]): void => {};

const deck = orderService.computedCollectionService.holdSlotByKey(order, 'spades');   // mints and holds the bucket too
effectService.createEffect(db, [], [deck], () => render(deck.computedValueService.getValueForSlot(deck)));
```

Its value is the bucket's slots in the bucket's order, produced on the read that
asks for it and never while nothing reads it. Its `changedAtRevision` and `changedAtEpoch` move only when
the list a reader would see has actually changed. The array comes back by
IDENTITY, unchanged for as long as the list holds, so a consumer that memoises on
identity needs no comparison of its own.

The source list is ONE slot, the bucket, and it never grows: a change to its slots
is a move of the bucket's value, not of the derivation's sources.

A sorted list is the other derivation of this kind:
[`createOIMComputedServiceSorted`](#a-sorted-list-is-a-computed-over-an-index) over an index.

---

## Standalone records

```typescript
type Settings = { theme: string; fontSize: number };

const settingsService = createOIMSingleEntityService<Settings>(db, {
    columnNames: ['theme', 'fontSize'],
});
const settings = settingsService.createStoreSlot(db);
const settingsContentService = settingsService.slotContentService;
settingsContentService.upsertEntity(settings, { theme: 'dark', fontSize: 14 });
const settingsSlot = settingsService.holdSingleSlot(settings);

effectService.createEffect(db, [settingsSlot], [], () => { console.log(settingsSlot.entity?.theme); });
effectService.createEffect(db, [settingsService.holdColumn(settingsSlot, 'theme')], [], () => {});

settingsContentService.updateEntity(settingsSlot, { theme: 'light' });
settingsContentService.deleteEntityColumns(settingsSlot, ['fontSize']);      // the thing a patch cannot say
settingsContentService.writeEntity(settingsSlot, { theme: 'dark', fontSize: 16 });   // columns it had and this does not, go
db.flush();
```

A standalone record is a single service: `createOIMSingleEntityService` is
`createOIMSingleSlotService` over `createOIMSlotContentEntityService`, with the store fixed to
`OIMSlotStoreServiceSingleSlotDriven` and no `keyOf`. Every option is optional:
`entityWriter` and `slotEmptiness` fall back to `OIMDefaults`, and `columnNames` names the
columns and files their slots in the ordinal store. The entity is
written through `slotContentService.upsertEntity(settings, entity)`, an ordinary write announced
to whoever subscribed, not handed to the options or to `createStoreSlot(db)`, which mints
nothing. The column doors sit on the single service itself: `getColumn(slot, columnName)`,
`holdColumn(slot, columnName)`, `getColumnGroup(names)`, `holdColumnGroup(slot, group)`,
`getAnyColumn(slot)`, `holdAnyColumn(slot)` and `unholdColumn(columnSlot)`, with the single slot
as the slot. It has at most one slot, read through the single doors: `getSingleSlot(settings)`,
`holdSingleSlot(settings)`, `findSingleSlot(settings)` (no mint) and
`hasSingleSlotContent(settings)`. Its slot is released like any slot, under its release policy
(by default a slot with a value stays), and the next `getSingleSlot` mints a fresh one. It
always reports.

---

## Caching what a consumer derives from a slot

Keep your own `Map` or `WeakMap`, or use `TOIMEntitySlot.data`
(`unknown[] | undefined`). It belongs to you, and the core never reads or writes
it. Clearing or removing the slot (`slotContentService.deleteEntity(slot)`, `slotContentService.deleteEntities(storeSlot, …)`)
does not reset it either, so clear what you put there yourself. Each index keeps its last key for
the entity in a separate field, `indexKeys`, which is read and written only through the
index's `IOIMIndexKeysService` (`get` / `set`).

---

## Giving handles back

There is no scope object, so keep an array. An effect carries no disposer, and
`unholdSlot` is a method on the slot's owner (`entitySlot.owner.unholdSlot`), so you wrap both in a
function of your own.

```typescript
const body = (): void => {};
const entitySlot = cardService.holdSlotByKey(cards, 'c1');

const disposers: TOIMDisposer[] = [];
disposers.push(effectService.subscribeEffect(db, [entitySlot], [], body));
disposers.push(() => { entitySlot.owner.unholdSlot(entitySlot); });
for (let i = disposers.length - 1; i >= 0; i--) disposers[i]();
```

By keeping the array yourself, you take on running the disposers in reverse order and making sure
a throwing disposer does not stop the rest. The engine ships no scope to do that for you.

---

## Export reference

**200 names. This list is `src/index.ts`; nothing else is exported.**

**The channel slot** — `OIMChannelService`, `TOIMChannelSlot`, `TOIMChannelSlotOptions`, `createOIMChannelSlot`,
`IOIMChannelMap`, `TOIMChannelFrame`, `TOIMChannelClock`, `TOIMChannelScheduler`, `OIMChannelQueue` (**type only**),
`oimIsAnySlotChangedAfter` (whether any of the slots changed after a given revision and epoch).

**Scheduling and errors** — `OIMFlushSchedulerService`, `TOIMFlushSchedulerSlot`, `TOIMTimer`, `TOIMDisposer`,
`IOIMErrorPolicy`, `OIMErrorPolicyLogAndContinue`, `TOIMErrorPolicyLogAndContinueOptions`, `OIMErrorPolicyThrowAtOnce`.

**Release policies and collectors** — `IOIMSlotReleasePolicy`,
`OIMSlotReleasePolicyAfterWrite`, `TOIMSlotReleasePolicyAfterWriteOptions`,
`OIMSlotReleasePolicyAfterIdle`, `TOIMSlotReleasePolicyAfterIdleOptions`,
`OIMSlotReleasePolicyAfterUnhold`, `TOIMSlotReleasePolicyAfterUnholdOptions`,
`OIMSlotReleasePolicyAtUnhold`, `OIMSlotReleasePolicyAtEmpty`, `OIMSlotReleasePolicyNever`, `OIMSlotReleasePolicyEarliest`,
`OIMUnusedSlotCollectorService`, `TOIMUnusedSlotCollectorSlot`, `createOIMUnusedSlotCollectorSlot`,
`TOIMCollectorSlot`, `TOIMCollectorSlotOptions`, `createOIMCollectorSlot`,
`OIMReleaseSlotCollectorService`, `OIMReleaseSlotCollectorServiceAfterIdle`, `OIMReleaseSlotCollectorServiceAfterUnhold`,
`OIMReleaseSlotCollectorServiceAfterWrite`, `OIMReleaseSlotQueueService`, `TOIMReleaseSlotCollectorSlot`,
`createOIMReleaseSlotCollectorSlot`, `oimSliceOfMs`, `OIM_SLICE_LENGTH_MS`.

**Slot services** — `OIMSlotColumnService` (the column doors both slot services inherit), `OIMSlotCollectionService`, `TOIMSlotCollectionServiceOptions`, `createOIMSlotCollectionService`,
`OIMSingleSlotService`, `TOIMSingleSlotServiceOptions`, `createOIMSingleSlotService`, `OIMSlotOwnerService` (**type only**),
`TOIMSlotOwnerServiceOptions`, `IOIMSlotContentStrategy`, `IOIMSlotContentFlushStrategy`, `IOIMSubframeCloseListener`,
`OIMContentChangeListenerService`, `IOIMContentChangeListener`, `IOIMStoreSlotListener`, `OIMStoreSlotListenerNone`.

**Slots and their owners** — `TOIMSlot`, `TOIMStoreSlot`, `TOIMSingleSlotStoreSlot`, `TOIMSlotEditable`, `TOIMKeyedSlot`,
`TOIMIndexableSlot`, `OIMSlotOwner`, `IOIMSlotOwner`, `IOIMSlotEmptiness`, `IOIMSlotStamp`, `TOIMSameValueGuard`,
`oimSameValueZeroGuard`, `oimIsSlotEmpty`, `oimIsSlotReleased`, `oimHoldSlots`, `oimUnholdSlotsIfAlive`,
`OIM_FROZEN_EMPTY_SLOTS`.

**Columns** — `TOIMColumnSlot`, `TOIMComputedColumnSlot`, `TOIMColumnGroup`, `TOIMColumnReaders`,
`OIMColumnOwner`, `OIMColumnOwnerPushDriven` (**type only**), `OIMColumnOwnerPullDriven`, `TOIMColumnOwnerOptions`.

**Entities** — `OIMSlotContentEntityService`, `TOIMSlotContentEntityServiceOptions`, `TOIMEntitySlotOwnerService`,
`TOIMEntitySlot`, `createOIMSlotContentEntityService`, `TOIMSlotContentEntityServiceFactoryOptions`, and the convenience wrappers `createOIMEntityService` and
`createOIMSingleEntityService`; `IOIMEntityWriter`, `createOIMEntityWriterInPlace`,
`createOIMEntityWriterReplacing`, `TOIMEntityWriterOptions`, `TOIMEntityInsertStrategy`,
`oimInsertEntityWithCopy`, `oimInsertEntityWithoutCopy`, `oimInsertEntityWithSanitizedCopy`, `oimPatchEntityColumns`,
`oimPatchEntityColumn`, `oimPatchEntityColumnsGuarded`, `oimPatchEntityColumnGuarded`, `oimPutEntityColumns`,
`oimPutEntityColumnsGuarded`, `TOIMEntityColumnName`, `TOIMEntityColumnValue`.

**Buckets** — `OIMSlotContentBucketService`, `OIMSlotContentBucketServiceArrayBased`,
`OIMSlotContentBucketServiceArrayDriven`, `OIMSlotContentBucketServiceSetDriven`,
`OIMSlotContentBucketServiceSortedArrayDriven`, `TOIMSlotContentBucketServiceOptions`,
`TOIMSlotContentBucketServiceSortedArrayDrivenOptions`, `TOIMBucketSlot`, `TOIMBucketSlotOwnerService`,
the convenience wrappers `createOIMBucketService` and `createOIMSingleBucketService`,
`TOIMBucketCollectionFactoryArguments`, `OIMBucketCommands`, `TOIMBucketCommandsOptions`, `IOIMBucketCommands`,
`IOIMBucketArrayMembership`, `OIMBucketArrayMembershipNonUnique`, `OIMBucketArrayMembershipUnique`,
`TOIMBucketSlotsSetStore`, `TOIMBucketSlotsArrayStore`, `TOIMBucketSlotsSortedArrayStore`, `TOIMBucketSlotsArrayUniqueStore`,
`OIM_NOTHING_WAS_INSERTED`, `OIM_NOTHING_WAS_REMOVED`, `OIM_REMOVED_WITHOUT_A_POSITION`.

**Indexes** — `OIMIndexService`, `OIMIndexServiceSortedArrayDriven`, `TOIMIndexServiceOptions`, `TOIMIndexStoreSlot`,
`TOIMIndexServiceStoreSlot`, `TOIMIndexServiceFactoryOptions`, `createOIMIndexService`, `createOIMIndexServiceByCompositeKey`,
`createOIMIndexServiceSortedArrayDriven`, `TOIMIndexKeyOptions`, `TOIMIndexKey`,
`IOIMIndexKeysService`, `TOIMIndexKeysPositions`, `OIMIndexKeysService`, `OIMIndexKeysServiceAppending`,
`OIMIndexKeysServiceReclaiming`.

**The graph** — `OIMEffectService`, `IOIMEffectService`, `TOIMEffect`, `TOIMEffectBody`, `TOIMEffectBodyWithSourceTracking`,
`OIMEffectSourceTracker` (**type only**), `TOIMComputedSlot`, `TOIMComputedSources`, `TOIMDerivation`, `TOIMComputedStoreSlot`,
`OIMComputedValueService`, `IOIMComputedValueService`, `TOIMComputedValueServiceOptions`, `oimRefreshSourceComputeds` (brings every computed in a `sourceComputeds` list current; call it before a `derive` that runs outside an effect, as `useOIMValue` does).

**Computed** — `OIMComputedService`, `TOIMComputedServiceOptions`, `createOIMComputedService`,
`OIMComputedServiceSorted`, `TOIMComputedServiceSortedOptions`, `createOIMComputedServiceSorted`, `TOIMSortedComputedSlot`,
`OIMComputedServiceBucketMemo`, `TOIMComputedServiceBucketMemoOptions`, `createOIMComputedServiceBucketMemo`,
`TOIMBucketMemoComputedSlot`, `TOIMSortColumn`, `TOIMSortableColumnName`, `oimColumnsComparator`.

**Stores and keys** — `TOIMStoreKey`, `IOIMSlotStoreService`,
`OIMSlotStoreServiceMapDriven`, `OIMSlotStoreServiceTreeDriven`,
`OIMSlotStoreServiceSingleSlotDriven`, `TOIMSingleSlotStore`, `TOIMDefaultSlotStore`, `TOIMSlotStoreTree`, `IOIMKeyTreeWalk`, `TOIMCompositeKeyNode`,
`OIMKeyTreeWalk`, `OIMKeyTreeWalkComposite`, `OIMKeyTreeWalkScalar`.

**The root and its defaults** — `OIMDB`, `TOIMDBOptions`, `OIMDefaults`, `OIMDefaultValue`, `TOIMFactoryOptions`.

**Comparison and diffing** — `oimSameSlotSequence`, `oimSameKeySequence`, `oimOrderedListCommandsOfTransition`,
`TOIMOrderedListCommand`.

**Shared stateless defaults** — the statics of `OIMDefaults`: `COLUMN_SLOT_STORE_SERVICE`,
`COMPUTED_COLUMN_SLOT_STORE_SERVICE`, `KEY_TREE_WALK_SCALAR`, `KEY_TREE_WALK_COMPOSITE`,
`STANDALONE_SLOT_OWNER`, `ENTITY_WRITER`, `ENTITY_SLOT_EMPTINESS`, `INDEX_KEYS_SERVICE`,
`STORE_SLOT_LISTENER`. Each is minted on its first `getValue()` instead of at module load, so a
consumer that names none of them constructs none of them. The cost of the single door is described under **Every optional
dependency has a default** above.

That is the whole of `src/index.ts`. If a name is not on this list, it is not
exported.

---

## Performance

**The only figures quoted in this document are the memory ones below.** Timings are on the
[benchmark pages](https://oimdb.org/docs/benchmarks/results).

**Memory.** Measured with `npm run retained` in `packages/bench` on 2026-10-22, using node
v24.16.0 on an Apple M1 with 8 cores. Each figure is over 100,000 rows: the heap difference
between processes built with and without the mechanism, divided by the row count. A reference
measured 8.00 B in the same run, and the noise floor was 64 B.

| what is held | per | bytes |
|---|---|---:|
| a settled, held derivation (`OIMComputedService`, fan-in 3, value a number) | derivation | 333.06 B |
| per-source readings for the same derivation, the per-slot clock arm that does not ship (modelled) | derivation | 79.95 B |

A derivation with a larger fan-in, or one whose value is a list, holds more. The per-store
heap for every participant is in [What each store holds](https://oimdb.org/docs/benchmarks/results#what-each-store-holds).

The measurement work in `packages/bench` aims at one claim: **for every
typical task there is a combination of shipped strategies whose cost is at or
below the hand-written floor**, on the same tasks that every framework in
`packages/bench` is measured on. A ratio above 1.00 counts as a loss only when no
strategy combination reaches the floor.

**Fast properties are checked, not timed.** Every slot kind is one object literal
with every field present at birth, per-index state lives in the `indexKeys`
array, nothing adds a field to a slot later or deletes one, and neither entity
writer `delete`s a column; each writes `undefined` instead, in place or into a spread copy. So every slot of a kind
keeps one V8 hidden class through holds, effects, moves between buckets, patches
and release deadlines, and an entity keeps its own when a column leaves or
arrives. `tests/what-v8-keeps-on-fast-properties.test.ts` asks V8 directly,
through its own natives, for fast properties and a shared map. `tests/how-many-shapes-reach-the-write-door.test.ts`
pins three slot shapes at the write door, one below V8's polymorphic ceiling, and four at
`holdSlot`, at the ceiling. What that saves per read is not measured. One case is outside the engine's reach: an entity handed in with a few hundred
fields is already in dictionary mode before it arrives.
