---
sidebar_position: 6
title: Slot lifecycle
description: How a slot is minted, kept by reference counts and released by a policy, and how to release identities on a clock with timed policies.
---

import SlotLifecycleDemo from '@site/src/components/DocDemos/SlotLifecycleDemo';

# Slot lifecycle

This page covers when an identity is created, what keeps it, and when it goes. When a write is
delivered (frames and subframes) is the channel's business and is covered in
[The channel](/docs/core/channel#the-frame).

<InShort>

- A slot is created only by a door that also decides what keeps it.
- A slot is kept by what counts on it: a hold, an effect, a column slot or a bucket it is a member of.
- A slot is released when the release policy agrees, and the caller never releases it.
- Releasing identities on a clock is opt-in, and off it costs nothing.

</InShort>

```ts setup
import { OIMDB, createOIMEntityService, oimIsSlotReleased } from '@oimdb/core';

type Card = { id: string; title: string };

const db = new OIMDB();
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const cardContentService = cardService.slotContentService;
```

## The life of a slot

A slot is the identity of one key in one collection, a store slot. Everything that reads, writes or
subscribes works through it, so its life is the part of the engine a consumer deals with every day.

<LifecycleDiagram />

| Stage | What happens | Who causes it |
|---|---|---|
| **Minted** | the slot owner creates the slot and files it under its key in the store slot's store | the first `getSlotByKey`, `holdSlotByKey`, `insertEntity` / `upsertEntity` for that key |
| **Kept** | something counts on it: a hold (`holdCount`), an effect filed on it, a column slot on it, a bucket it is a member of | you, an effect, an index |
| **Filled / emptied** | a value lands on it or leaves it; the identity stays the same either way | writes: `upsertEntity`, `updateEntity`, `deleteEntity` |
| **Asked to go** | the last thing keeping it gives it back, or its value leaves while nothing keeps it | `unholdSlot`, `effectService.disposeEffect(effect)`, the unused-slot collector at flush, a delete |
| **Released** | the release policy agrees; the value (if any) is cleared, the slot leaves the store, its RELEASED flag is set (`oimIsSlotReleased(slot)`) | the owner, never the caller |

Try the stages on a real collection: mint with a getter and flush, hold and give back,
write a value and delete it. Watch the identity number change when a released key
is minted again.

<SlotLifecycleDemo />

### Minted — four doors, and each one says who keeps the result

A slot is created only by a door that also decides what keeps it, so nothing can mint
an identity and leave it with no owner of its lifetime:

- **`getSlotByKey(storeSlot, key)`** mints and hands the slot to the **unused-slot collector**,
  which holds it until the next flush. A read you do not keep is given back for you.
- **`holdSlotByKey(storeSlot, key)`** mints and holds; the hold is yours to give back.
- **A write** (`upsertEntity`, `insertEntity`) mints and fills; the value keeps it
  under the default policy.
- **An effect** holds every slot it subscribes to until `effectService.disposeEffect(effect)`.

```ts
const peek = cardService.getSlotByKey(cards, 'c1');
db.flush();
const released = oimIsSlotReleased(peek);
const again = cardService.getSlotByKey(cards, 'c1');
const isNewIdentity = again !== peek;
```

`peek` was minted empty and kept only by the collector. The flush gave that hold back,
nothing else counted on the slot and it had no value, so it was released: `released` is
`true`. The next read of `'c1'` mints a **new** identity, so `isNewIdentity` is `true`.

### Kept — references are counted

Every reason to keep a slot is a count the owner keeps, and the owner is the only
writer of it: `holdCount`, the `effects` list, the column slots on the carrier, bucket
membership. There is no release command. A command would let one caller drop an
identity another caller is still subscribed to; counting references lets the owner
decide "nothing refers to it" in one place.

```ts
const ace = cardService.holdSlotByKey(cards, 'c2');
const filled = cardContentService.upsertEntity(cards, { id: 'c2', title: 'Ace' });
const isSameIdentity = filled === ace;
db.flush();
ace.owner.unholdSlot(ace);
const keptByValue = !oimIsSlotReleased(ace);
cardContentService.deleteEntity(ace);
const goneWithValue = oimIsSlotReleased(ace);
```

The hold minted `'c2'` empty; the upsert filled the **same** slot. After the hold was
given back the slot stayed, because under the default policy a value keeps it. The
delete took the value away while nothing held it, and the slot went.

### Asked to go — the release policy answers

When the last reference goes, or the value leaves an unheld slot, the owner asks
`releaseSlotIfUnheld(slot)`. It re-checks everything (not held, not referenced, still
owned by this owner) and then asks the release policy. How long
data is worth keeping is a property of the collection type, not of each caller: a store of
entities keeps what was written, a computed can be derived again and is dropped, and a
cache of a remote list may be kept for a while after the screen closes. The policy is
chosen once, at construction, so no write path branches on it. The policies are
listed in the table in
[releasing an identity on a clock](#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).

### Released — the slot is dead and its key can be minted again
Releasing a slot clears its content (an entity's value, a bucket's members, a computed's sources)
and removes it from the store. After that, the object you still hold is a dead identity: every door that works
with it (`holdSlot`, `unholdSlot`, a write, a subscription) throws
"This identity was released". The key is not dead: the next door for it mints a new
slot. So the long-lived things to keep in your code are the services and their store slots (entity,
bucket, index or computed), and you keep a slot only for as long as you hold it.

```ts
const late = cardService.getSlotByKey(cards, 'c3');
db.flush();
try {
    late.owner.holdSlot(late);
} catch {
    const fresh = cardService.holdSlotByKey(cards, 'c3');
    fresh.owner.unholdSlot(fresh);
}
```

`deleteEntity` / `deleteEntities` are not a release: they take the **value** away
and leave the identity standing for as long as something keeps it. A subscriber of a
deleted entity is still subscribed, and a later upsert under the same key lands on the
same slot.

## Releasing an identity on a clock — opt-in, and off it costs nothing

A slot is memory: the identity, its value, and whatever it files.
A screen that only ever shows what it holds can let the rest go, and a cache of
server responses can let data go once it is stale. Both are a slot release
policy, handed in at construction. A policy decides whether and when a slot
goes. It does no work itself, and the slot still goes only when nothing holds it
and nothing refers to it.

There is no `release(slot)` door: a slot you could release by hand could be released
under a subscriber somebody else took. The policy is asked at the moments a slot could
go (a write, the last subscriber leaving, the last hold given back), and a hold always
outranks its answer.

| Policy | A slot goes | Take it for |
|---|---|---|
| `OIMSlotReleasePolicyAtEmpty.INSTANCE` | once it has no value and nothing holds it; a slot with a value stays. A computed, never empty, stays while its store slot lives | the default for entity, bucket and index collections |
| `OIMSlotReleasePolicyNever.INSTANCE` | never, empty or not; a deleted key's slot stays filed | a small, fixed key space whose identities you want stable |
| `OIMSlotReleasePolicyAtUnhold.INSTANCE` | the moment nothing holds it, even with a value — at its last unhold, and right after a write into a slot nobody holds | keeping only what something is subscribed to or holds; the default for every computed, single or collection |
| `OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs })` | once its last write is older than the window | data that goes stale on a known schedule |
| `OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs })` | once nothing has watched it for the window | a cache that keeps what was recently on screen |
| `OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs })` | once the window after its last unhold has passed; a hold taken again inside it keeps the slot. A slot that was never held is never on this clock | navigating back to a screen within the window |
| `OIMSlotReleasePolicyEarliest([...])` | as soon as any of several policies says so | combining windows |

Under `OIMSlotReleasePolicyAtUnhold`, a write into an entity nothing holds
releases it at once: the slot comes back released (`oimIsSlotReleased(slot)`) and `hasSlotContentByKey` for
its key is `false`. An entity filed into a held bucket is kept, because the bucket
holds it.

**Where the policy comes from.** `OIMDB` hands its `slotReleasePolicy` to what its factories build
(`createOIMEntityService`, `createOIMSlotContentEntityService`, `createOIMSingleEntityService`,
`createOIMBucketService`, `createOIMSingleBucketService` and the index factories). Each of them takes a
`slotReleasePolicy` of its own to override it for one collection type, and so for every store slot of it. If
neither names one, the collection is built with `OIMSlotReleasePolicyAtEmpty.INSTANCE`. The computed
factories take no db and default to `OIMSlotReleasePolicyAtUnhold.INSTANCE` instead; pass one in their
options to change it.

```typescript
import {
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotReleasePolicyAfterUnhold,
    OIMSlotReleasePolicyAfterWrite,
    OIMSlotReleasePolicyEarliest,
} from '@oimdb/core';

const releasingDb = new OIMDB({
    slotReleasePolicy: new OIMSlotReleasePolicyEarliest([
        new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 60_000 }),
        new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 30_000 }),
    ]),
});

const unholdingDb = new OIMDB({
    slotReleasePolicy: new OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs: 5_000 }),
});
```

### The question a policy answers

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

Implement it to write a policy of your own. The engine calls:

| Method | Called when | What the answer does |
|---|---|---|
| `onSlotWritten` | a write leaves the slot with a value | a write window restarts here |
| `onSlotIdle` | the slot first gets a value with no subscriber, or its last subscriber leaves | `true` means already due: a freshly filled slot goes to the unused-slot collector and leaves at the end of the frame; an idle one is released at once if nothing holds it |
| `onSlotUnheld` | its last hold is given back | an unhold window restarts here |
| `isSlotReleasable` | nothing holds it, nothing refers to it, and it has a value | `true` releases it; `false` keeps it, and a timed policy files it into its own queue |
| `isEmptySlotReleasable` | the same, for a slot with no value | only `OIMSlotReleasePolicyNever` answers `false` |
| `cancelSlotRelease` | the slot is being released | takes it off the policy's queue |

`releasesWrittenSlots`: whether the policy can ever release a slot that holds data. `false`
lets writes skip the release check. `schedulesReleaseOnWrite`: whether a write can schedule
a release. `false` lets writes skip `onSlotWritten`. Both are read once, at construction.

### Controlling the clock

Each timed policy is swept by its own stateless collector service (`OIMReleaseSlotCollectorServiceAfterWrite`,
`OIMReleaseSlotCollectorServiceAfterIdle` or `OIMReleaseSlotCollectorServiceAfterUnhold`, each an `INSTANCE`),
and its state is one release collector slot on the db's `collectorSlot`. The clock and the timer are the db's:
`new OIMDB({ getNowMs, releaseTimer })`, `getNowMs` defaulting to `Date.now` and the timer to a `setTimeout`
that is `unref`ed, so it does not keep a Node process alive. Pass both to control time:

```typescript
import { OIMReleaseSlotCollectorServiceAfterIdle, OIMSlotReleasePolicyAfterIdle } from '@oimdb/core';

let nowMs = 0;
const testDb = new OIMDB({
    getNowMs: () => nowMs,
    releaseTimer: () => () => undefined,
    slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 30_000 }),
});

nowMs += 31_000;
OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(testDb.collectorSlot.afterIdleReleaseSlotCollectorSlot);
```

`flush(releaseSlotCollectorSlot)` releases everything due up to now; `cancelAllSlotReleases(releaseSlotCollectorSlot)`
empties the queue and disarms the timer. Deadlines are swept in slices of `OIM_SLICE_LENGTH_MS`
(1024 ms), so a slot goes up to one slice after its deadline, never before, and many slots on one
clock cost one timer.

### What restarts each window

Each timed policy keeps its own deadline on the slot. Under `OIMSlotReleasePolicyEarliest` a slot
goes on the soonest one, and a hold outranks all of them.

| Policy | Window restarts on | Not on |
|---|---|---|
| `OIMSlotReleasePolicyAfterWrite` | every write that leaves a value, `updateEntity` included | a subscriber arriving or leaving |
| `OIMSlotReleasePolicyAfterIdle` | the first value of a slot nobody subscribes to, and the last subscriber leaving | a later write, or an unhold |
| `OIMSlotReleasePolicyAfterUnhold` | every last unhold | a write |

A refetch that lands before the sweep restarts the write window of the entities it rewrote.

### An idle window opens twice, and a held slot is off the clock

An idle window opens in exactly two places: when the slot first gets content and nobody
subscribes to it, and when its last subscriber leaves. An empty slot gets no window; it goes
as soon as nothing holds it. An unhold opens no idle window.

A held slot is off the clock. Two consequences follow:

- A hold defers the verdict; it does not restart the clock. An entity whose window
  ran out while it was held goes at the give-back itself.

  ```typescript
  const heldSlot = cardService.holdSlotByKey(cards, 'c1');
  // …the window passes, sweeps run, nothing happens to this slot…
  heldSlot.owner.unholdSlot(heldSlot);
  oimIsSlotReleased(heldSlot); // true — the give-back settles what the sweep could not
  ```

  The last subscriber leaving is the other case: the last `disposeEffect(effect)` grants a full
  fresh idle window.

- A cascade takes one sweep: a stale bucket that goes gives back its entities, and those whose own
  windows ran out go in the same sweep.

A subscriber is a hold, so a watched slot is off the clock and never loses data mid-read. No read is
reported to the clock. After the last dispose, `OIMSlotReleasePolicyAfterIdle` grants a whole fresh
window, while `OIMSlotReleasePolicyAfterWrite` grants only what is left of the write window, so an
already-stale entity goes on that call.

A bucket runs its own window, given to its own collection. A bucket something holds keeps every
entity in it whatever the entities' own age.

## Where to next

<DocCards>
<DocCard to="/docs/core/channel#the-frame" title="The channel: the frame">When a write is delivered: frames, the clock and subframes.</DocCard>
<DocCard to="/docs/core/model" title="The model">The four doors and the terms.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">Which door to take and what a write wakes.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Why a computed is pulled.</DocCard>
</DocCards>
