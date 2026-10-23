---
sidebar_position: 1
description: What OIMDB is, the one idea behind it, a small example, the packages it ships, and which page to open for your task.
---

# OIMDB

OIMDB is state management for applications that outgrew a basic store: a wide toolkit
at close to the cost of a hand-written implementation. It ships signals (computed values
and effects), granular subscriptions down to one column of one entity, and memory
management that releases whatever nothing holds or watches, under a policy you pick;
general-purpose stores keep everything until you delete it yourself. It holds every entity
of your application once, keeps groups, sorted views and derived values in sync with it, and tells
subscribers what changed. It does so once per **frame**, the delivery of every write made
since the previous one (see the [glossary](/docs/core/model#glossary)), however
many writes landed.

It is for applications built on collections: cards, messages, tasks, anything
with an id that shows up in more than one list or screen. It covers what a bare
store leaves to you: normalised storage, grouping by a column, sorted views,
per-entity and per-column subscriptions, batching, and releasing what nobody holds.
It is not worth it for a few global values with no collections behind them, where a
signal library or a bare store is enough. [Why OIMDB](/docs/why-oimdb) works through the
same task with zustand and with OIMDB.

```bash
npm install @oimdb/core
```

These pages describe `@oimdb/core` 4.x. See
[Installation](/docs/getting-started/installation) for the other packages.

## The one idea

A key is resolved to an **identity** once. From then on, every read, write and
subscription goes through that identity. A bucket holds the slots themselves,
each one the identity of an entity; a subscription is a handler hanging on an
identity; a bucket is an identity whose content is other identities.

That is why every write takes the identity (`updateEntity(slot, patch)`,
`deleteEntity(slot)`), and there is no write door that takes a key: a caller holding
only a key resolves it first with `getSlotByKey`, so the lookup is a call you can see.

<SlotDiagram />

Three sentences carry the rest:

1. Four doors mint an identity: writing a value, subscribing, taking a
   hold, and `getSlotByKey`, whose mint the unused-slot collector holds for the
   turn. `findSlotByKey`, `hasSlotContentByKey` and `findEntityByKey` read without minting.
2. A slot goes when nothing refers to it, and whatever took a reference
   gives it back.
3. Where a trade-off has two defensible strategies, both ship and you pick one
   at construction, so no branch is left on a hot path.

See [The model](/docs/core/model).

## A small example

```typescript
import {
    OIMDB,
    OIMEffectService,
    createOIMBucketService,
    createOIMEntityService,
    type TOIMEntitySlot,
} from '@oimdb/core';

type Card = { id: string; deck: string; title: string };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;

const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);

const byDeckService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const byDeck = byDeckService.createStoreSlot(db);

const first = cardService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'd1', title: 'alpha' });
const deckOne = byDeckService.holdSlotByKey(byDeck, 'd1');
byDeckService.slotContentService.writeBucketMemberSlots(deckOne, [first]);
db.flush();

const effect = effectService.createEffect(db, [deckOne], [], () => {
    console.log('deck d1 now has', byDeckService.slotContentService.getBucketMemberSlotCount(deckOne), 'card(s)');
});

const second = cardService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'd1', title: 'beta' });
byDeckService.slotContentService.writeBucketMemberSlots(deckOne, [first, second]);
db.flush();              // -> "deck d1 now has 2 card(s)"

effectService.disposeEffect(effect);
deckOne.owner.unholdSlot(deckOne);
```

`OIMDB` holds the clock, the default channel slot and the unused-slot collector slot that every
collection in the example shares. It also holds the optional strategies you give it
(`entityWriter`, `slotReleasePolicy`, `slotStamp`, `indexKeysService`), and the
factories that take `db` pass them to what they build. A service holds no
data: `cardService` is made once for the `Card` type, and `cards` is one store slot
of it, an instance carrying its own store. The collection service reads; its
`slotContentService` writes. A door that works on the store takes the
store slot first (`upsertEntity(cards, …)`); a door that works on a slot takes only
the slot. `byDeck` is a
manual bucket store slot: you write what a bucket holds, because no column
can express "the server did not return these". When membership follows from a
column, an index fills the buckets instead. [Quick Start](/docs/getting-started/quick-start)
builds that version, with a sorted view on top.

Every write is reported to the channel slot of the store slot it lands in.
`createOIMEntityService` is a convenience wrapper: the base layer is
`createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService(db, { keyOf }) })`.
See [Writing](/docs/core/writing).

## Packages

| Package | What it is |
|---|---|
| [`@oimdb/core`](/docs/core/model) | The engine. |
| [`@oimdb/react`](/docs/packages/react) | React bindings: `OIMDBProvider` and thirteen hooks (`useOIMDB`, `useOIMValue`, `useOIMComputedValue`, `useOIMComputedValueByKey`, `useOIMSingleComputedValue`, `useOIMComputedCollection`, `useOIMEntity`, `useOIMSingleEntity`, `useOIMField`, `useOIMBucketSlots`, `useOIMBucketSlotsByKey`, `useOIMSingleBucketSlots`, `useOIMSlotsByKeys`). |
| [`@oimdb/persist`](/docs/packages/persist) | Storage-agnostic persistence, with five backends: `persist-idb`, `persist-localstorage`, `persist-async-kv`, `persist-json`, `persist-memory`. |
| [`@oimdb/exodra`](/docs/packages/exodra) | Bridge into an Exodra reactive surface. |
| [`@oimdb/redux-adapter`](/docs/packages/redux-adapter) | Mirrors entity and bucket store slots into Redux. |
| `@oimdb/devtools` | A debug registry: name store slots and indexes, inspect runtime state. |
| `@oimdb/mcp` | An MCP server and CDP inspector that connects AI assistants to live browser state. |

See [Packages](/docs/packages/) for what each one imports from the core.

## Where to go for your task

### Start

<DocCards>
  <DocCard to="/docs/getting-started/installation" title="Installation">npm or a CDN.</DocCard>
  <DocCard to="/docs/getting-started/quick-start" title="Quick Start">A collection, an index, a sorted view, a subscription and a flush in one program.</DocCard>
  <DocCard to="/docs/why-oimdb" title="Why OIMDB">Decide whether it fits your application.</DocCard>
  <DocCard to="/docs/recipes" title="Recipes">The code for a common task.</DocCard>
</DocCards>

### Store and change data

<DocCards>
  <DocCard to="/docs/core/collections" title="Collections and identities">Store entities by key, composite keys included.</DocCard>
  <DocCard to="/docs/core/writing" title="Writing">Insert, update, delete, and pick a writer.</DocCard>
  <DocCard to="/docs/core/object" title="Standalone records">One record that is not part of a collection.</DocCard>
  <DocCard to="/docs/core/indexes" title="Buckets">Hold a server response's list.</DocCard>
</DocCards>

### Derive and deliver

<DocCards>
  <DocCard to="/docs/core/oimindex" title="Indexes">Group entities by a column, and sort a group.</DocCard>
  <DocCard to="/docs/core/computed-effects" title="The compute graph">Derive a value from other slots.</DocCard>
  <DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Read, and subscribe to an entity or one column.</DocCard>
  <DocCard to="/docs/core/channel" title="The channel">When a write is delivered: frames, subframes, schedulers.</DocCard>
  <DocCard to="/docs/core/lifecycle" title="Slot lifecycle">How long a slot lives and when it is released.</DocCard>
</DocCards>

### Apps and operations

<DocCards>
  <DocCard to="/docs/packages/react" title="React">Hooks over the effect service.</DocCard>
  <DocCard to="/docs/packages/persist" title="Persist">Save collections to storage and load them back.</DocCard>
  <DocCard to="/docs/guides/ssr" title="Server-side rendering">Render on the server and hand the state to the client.</DocCard>
  <DocCard to="/docs/guides/error-handling" title="Error handling">What happens when a subscriber or a write throws.</DocCard>
  <DocCard to="/docs/guides/with-cnstra" title="Delivery with cnstra">Drive the flush from an orchestrator.</DocCard>
  <DocCard to="/docs/guides/performance" title="Performance">Pick strategies for speed.</DocCard>
  <DocCard to="/docs/benchmarks" title="Benchmarks">What has been measured, against which libraries.</DocCard>
</DocCards>

### Under the hood

<DocCards>
  <DocCard to="/docs/core/model" title="The model">Slots, the four doors, the frame and the strategies.</DocCard>
  <DocCard to="/docs/core/how-it-works" title="How it works, and why">How the engine works and why it is built this way.</DocCard>
  <DocCard to="/docs/core/architecture" title="Architecture">How the source is laid out.</DocCard>
  <DocCard to="/docs/core/reference" title="API reference">Every export, one line each.</DocCard>
</DocCards>
