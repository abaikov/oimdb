---
sidebar_position: 2
description: How to fill store slots on the server, serialize them with bucket slots, rebuild the same shape on the client, and end the request cleanly.
---

# Server-side rendering

There is no SSR mechanism in this engine, and there does not need to be. SSR
pre-state is a store slot that is already filled before the client's first
render: the server fills it and serializes what it filled, the client builds the
*same* services and store slots and writes the same content in.

<InShort>

- Two things cross the wire: the entities, and which slots each bucket holds.
- The server fills the store slots and serializes both; the client writes the same content into the same shape.
- A bucket content service's `writeBucketMemberSlots` states a bucket's whole list, so a bucket keeps only what the snapshot lists. Compute a merged list yourself if you mean a merge.
- Load before the first render, and hold any bucket that nothing else keeps until it is serialized.

</InShort>

:::warning[This page routes nothing through `@oimdb/persist`]

Everything below uses the core alone. Persistence is available, but an SSR fill
is two ordinary writes, and routing it through a persistence engine would
document a dependency it does not need. For persistence itself, see
[Persist](/docs/packages/persist).

:::

**When to take the other route.** If the application already registers its
store slots with an `@oimdb/persist` persistor, `@oimdb/persist-json` is the SSR
transport for that setup: `OIMPersistJsonBackend` keeps every resource under its
`storageKey`, the server calls `dehydrate()` and stringifies the dump, and the
client passes it back as `initialPersistJsonDump` to a backend serving the same
resources (recipe in
[Persist: backends — JSON](/docs/packages/persist-backends#json-for-server-side-rendering)).
Take the route on this page when nothing else needs a persistor. Then the
fill is two writes and nothing more.

## What has to cross the wire

Two things, and keeping them separate is the whole of the shape:

1. **The content**: the entities.
2. **The bucket lists**: which slots are in which bucket.

The second is not implied by the first. Which slots a bucket holds is a fact
about the **response** you composed, and no column can express absence, so it is
stated separately on both sides. See
[Buckets](/docs/core/indexes#a-buckets-slots-are-the-callers).

## Server: fill, then serialize both

```ts setup
import {
    OIMChannelService, OIMDB, createOIMBucketService, createOIMEntityService, type TOIMEntitySlot,
} from '@oimdb/core';

type Question = { id: string; text: string; answer?: string };

const db = new OIMDB();
const questionService = createOIMEntityService<Question>(db, { keyOf: (question) => question.id });
const questions = questionService.createStoreSlot(db);
const resultService = createOIMBucketService<TOIMEntitySlot<Question>>(db);
const results = resultService.createStoreSlot(db);
const resultContentService = resultService.slotContentService;
```

```typescript
const entities: readonly Question[] = [
    { id: 'q1', text: 'What is your name?' },
    { id: 'q2', text: 'What is your quest?' },
];

questionService.slotContentService.insertEntities(questions, entities);

const page = resultService.holdSlotByKey(results, 'page-1');
resultContentService.writeBucketMemberSlots(page, entities.map((question) => questionService.getSlotByKey(questions, question.id)));
db.flush();

const snapshot = { entities, bucketIds: entities.map((question) => question.id) };
const html = `<script>window.__OIM__ = ${JSON.stringify(snapshot).replace(/</g, '\\u003c')}</script>`;
```

:::warning[Escape the inlined blob]
A raw `</script>` inside your data ends the inline `<script>` early. Escape `<`
before inlining, as above.
:::

## Client: build the same shape, write the same content

```typescript
const snapshot = (window as unknown as { __OIM__: { entities: Question[]; bucketIds: string[] } }).__OIM__;

// …the same db, services and store slots as on the server…

questionService.slotContentService.insertEntities(questions, snapshot.entities);

const page = resultService.holdSlotByKey(results, 'page-1');
resultContentService.writeBucketMemberSlots(
    page,
    snapshot.bucketIds.map((id) => questionService.getSlotByKey(questions, id)),
);
db.flush();

// hydrateRoot(document.getElementById('root')!, <App />);
```

`insertEntities` fits both sides for the same reason: its precondition is the one
an SSR fill meets. It refuses a key that already has an identity in the store slot, and a key
named twice in the same load. An empty identity counts: a `getSlotByKey` read or a hold on a key
mints one, and it makes the next `insertEntities` of that key refuse. On a refusal it rolls back
the entities that call filed and nothing else. The whole load runs inside one
subframe, so it is one frame's worth of writes rather than one per entity. Per key it still does
a lookup and a store, the same two hash operations an `insertEntity` does, so what it buys is the
refusal, not fewer hashes. `fillEntities(storeSlot, keys, entities)` is the stricter companion: it
also refuses when the store slot holds any identity at all. If anything may have read the store
slot first (a cache seeded before the SSR blob arrives, a component that called `getSlotByKey`),
use `upsertEntities`, which asks per entity and works in any state.

Pick between `insertEntities` and `upsertEntities` by precondition: the first
refuses a key that already has an identity, the second takes any state.

## Restating a bucket's slots evicts, and that is the contract

`writeBucketMemberSlots` states the **whole** list. Applying a snapshot of two questions
onto a bucket that currently holds five leaves the bucket holding **two**. The
other three keep their content in the entity store slot and leave the bucket.

There is nothing left to ask: every bucket's slots here are the caller's, nothing
re-derives them from a column, and a bucket the load left alone would come back
holding whatever it held before. If you mean a merge, compute the merged list
yourself and state that:

```typescript
const page = resultService.holdSlotByKey(results, 'page-1');
const incoming = [questionService.getSlotByKey(questions, 'q3')];
const merged = [...new Set([...resultContentService.getBucketMemberSlots(page), ...incoming])];
resultContentService.writeBucketMemberSlots(page, merged);
```

`writeBucketMemberSlots` is idempotent, so re-stating an unchanged list evicts nothing
and wakes nobody: the bucket content service reconciles the new list against the
old one, and when nothing arrived and nothing departed the write returns `false`
without marking the bucket (`OIMSlotContentBucketService.writeBucketMemberSlots`).

**Why a whole list and not add/remove calls.** A server response is a whole list.
Stating it whole means the client never has to know what it held before, and the
reconcile computes the arrivals and departures once, in the engine, instead of in
every caller.

## The identities are the same on both sides

Nothing about the pre-state is special, and that is the point of seeding the same
store slot rather than a parallel cache: an entity the server sent and an entity a later
write patches are **one identity**, resolved once, watched by the same effects.
There is no reconciliation pass and no "hydration mismatch" concept in the engine.
A load is an ordinary batch of writes, delivered in an ordinary frame.

Load **before** the first render if you can. A load that lands after components
have mounted is not wrong, but it is a second frame: the first paint will have
been of an empty store slot, and every effect is woken once when the content
arrives.

## Hold what nothing else holds

```typescript
const page = resultService.holdSlotByKey(results, 'page-1');
```

Keep that `page` slot for as long as the bucket is meant to exist, and call
`page.owner.unholdSlot(page)` when it is not. Under the default release policy,
`OIMSlotReleasePolicyAtEmpty`, a bucket is kept by its slots, its effects (an
effect holds what it subscribes to) and its holds; one that passes through empty
with none of the three is unfiled. On the server, where nothing subscribes, the
hold is what keeps an empty bucket (a page with no results) between
`writeBucketMemberSlots` and the serialization, and what keeps any bucket under a policy
that releases on a clock.

**Why a hold and not a "keep" flag.** A hold is counted and given back by the
thing that took it, so two parts of a request that both need the page cannot
release it out from under each other; a flag would have one owner and no answer
for the second.

## Ending the request

The db above is built per request and nothing on the server subscribes to
its channel, which is the precondition of the one call that ends a channel whole:

```typescript
OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot);   // nothing is subscribed to anything in it
```

It sets a flag that makes every later `flush()` and flush request a no-op,
cancels a scheduled flush, hands back the mints the unused-slot collector took for
the frame it will now never run, empties the list of pending effects and the
after-each-frame and after-each-flush handlers, and returns. Nothing walks a slot to ask who is subscribed to it, and
the request's services and store slots go when your own references to them do. The engine does not verify
the precondition, because that check would be the walk the call exists to skip. So on a
server that *does* subscribe, keep that guarantee yourself or do not call it. See
[dropping the whole channel](/docs/core/channel#dropping-the-whole-channel).

## Where to next

<DocCards>
<DocCard to="/docs/core/indexes" title="Buckets">Why a bucket's slots are stated separately.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">`insertEntities` and its precondition.</DocCard>
<DocCard to="/docs/getting-started/quick-start" title="Quick Start">Build a working program step by step.</DocCard>
</DocCards>
