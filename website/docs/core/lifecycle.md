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
Releasing a slot does the following, in order: it lets the content strategy release the slot's content
(an entity's value is cleared, a bucket gives back its members, a computed gives back its sources), marks it
empty, cancels any release the policy had scheduled, removes the slot from the store, and sets the RELEASED
flag in `slotFlags`.

After that, the object you still hold is a dead identity: every door that works
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

There is no `release(slot)` door. A slot that the caller could release by hand
could be released under a subscriber that somebody else took, so the decision is
the owner's. The owner asks the policy at the moments a slot could go (a write, the last
subscriber leaving, the last hold given back), and a hold always outranks the
answer. Picking the policy once at construction is the
[strategy rule](/docs/core/model#forks-are-strategies-chosen-at-construction): no branch on
a flag runs per write.

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

The owner (`OIMSlotOwnerService`) calls these, and nothing else does:

| Method | Called when | What the answer does |
|---|---|---|
| `onSlotWritten` | a write leaves the slot with a value | a write window restarts here |
| `onSlotIdle` | the slot first gets a value with no subscriber, or its last subscriber leaves | `true` means already due: a freshly filled slot goes to the unused-slot collector and leaves at the end of the frame; an idle one is released at once if nothing holds it |
| `onSlotUnheld` | its last hold is given back | an unhold window restarts here |
| `isSlotReleasable` | nothing holds it, nothing refers to it, and it has a value | `true` releases it; `false` keeps it, and a timed policy files it into its own queue |
| `isEmptySlotReleasable` | the same, for a slot with no value | only `OIMSlotReleasePolicyNever` answers `false` |
| `cancelSlotRelease` | the slot is being released | takes it off the policy's queue |

`releasesWrittenSlots` says whether the policy can ever release a slot that holds data; a content service reads it once at construction and skips the after-write release check when it is false. `OIMSlotReleasePolicyAtEmpty` and `OIMSlotReleasePolicyNever` answer `false`, every timed policy and `OIMSlotReleasePolicyAtUnhold` answer `true`, and `OIMSlotReleasePolicyEarliest` answers `true` when any policy it combines does.

`schedulesReleaseOnWrite` says whether a write can make the policy schedule a release. The slot owner reads it once at construction; when it is `false` and the db has no `slotStamp`, a write skips `onSlotWritten` and the first-fill `onSlotIdle`, two calls that do nothing under such a policy. `OIMSlotReleasePolicyAfterWrite` and `OIMSlotReleasePolicyAfterIdle` answer `true`; `OIMSlotReleasePolicyAtEmpty`, `OIMSlotReleasePolicyNever`, `OIMSlotReleasePolicyAtUnhold` and `OIMSlotReleasePolicyAfterUnhold` answer `false`; `OIMSlotReleasePolicyEarliest` answers `true` when any policy it combines does. `onSlotIdle` is still called when the last subscriber leaves.

A zero window never touches a release queue or a timer. A window above zero is
filed in that policy's own queue. The owner never asks how much time is left.

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
empties the queue and disarms the timer. The queue (`OIMReleaseSlotQueueService.INSTANCE`) files
slots into slices of `OIM_SLICE_LENGTH_MS` (1024 ms) and the timer is armed for
the end of the earliest filed slice, so a slot goes at the first sweep at or after
its deadline: up to one slice late, never early. A slice is swept as a whole,
which is why many slots on one clock cost only one timer.

### Three markers, one per timed policy

A slot carries three deadlines, and each policy moves its own and no other.
`-1` means unset; under `OIMSlotReleasePolicyEarliest` a slot goes on the soonest
of those that are set, and a hold outranks all of them.

| Marker | Moved by | Not moved by |
|---|---|---|
| `releaseDueAfterWriteMs` | every write that leaves a value, under `OIMSlotReleasePolicyAfterWrite` | a subscriber arriving or leaving |
| `releaseDueAfterIdleMs` | the first value of a slot nobody subscribes to, and the last subscriber leaving, under `OIMSlotReleasePolicyAfterIdle` | a later write, or an unhold |
| `releaseDueAfterUnholdMs` | every last unhold, under `OIMSlotReleasePolicyAfterUnhold` | a write |

A single field could not say which event is allowed to move it: a write arriving
after the subscriber left would destroy the idle policy's verdict, and the last
subscriber leaving after a write would destroy the write policy's.

The earliest deadline wins. `OIMSlotReleasePolicyEarliest` asks every member
and releases when any of them answers `true`. Each member keeps its own queue and
timer.

The policy answers "release it now". Once a marker has come due, the release
queue calls `slot.owner.releaseSlotIfUnheld(slot)`. For a non-empty slot with
nothing left keeping it, the owner asks the policy's `isSlotReleasable(slot)`.
`true` releases the slot. `false` keeps it, and a finite-deadline policy has
already filed it into its queue itself. For an empty slot, the owner asks
`isEmptySlotReleasable(slot)`, and only `OIMSlotReleasePolicyNever` answers
`false`. With no policy, the owner is built with
`OIMSlotReleasePolicyAtEmpty`, so a non-empty slot is kept and an empty one goes.

Any update renews the write window, `slotContentService.updateEntity(slot, patch)`
included. The policy runs on every write door that leaves the slot with content,
just after emptiness is settled, not only on a whole-entity write. An entity already
on the queue stays where it is filed; the sweep re-reads its deadline when that
slice comes due and files it again then. A write window says "this data is
good until the next query", so the clock starts again where the query lands. A
refetch arriving before the sweep reached the old entities must not leave them due a
second later.

### An idle window opens twice, and a held slot is off the clock

An idle window opens in exactly two places:

1. when the slot first gets content and nobody subscribes to it (a slot minted
   empty by a read that found nothing is on no clock at all);
2. when the last subscriber leaves, that is, when `unsubscribeFromSlot` takes the last entry out
   of `slot.effects`.

Both ask the policy's `onSlotIdle(slot)`. Under `OIMSlotReleasePolicyAfterIdle`
it stamps `releaseDueAfterIdleMs = now + keepAfterIdleMs` and files the slot into
the policy's queue. An empty slot gets no window at all: the release guard takes it
without asking a clock. `unholdSlot` opens no idle window and stamps nothing.

A held slot is off the clock. A sweep that meets one decides nothing
about it and does not re-file it. Two consequences follow:

- A hold defers the verdict; it does not restart the clock. An entity whose window
  ran out while it was held goes at the give-back itself, because `unholdSlot` asks
  the owner whether the slot may go.

  ```typescript
  const heldSlot = cardService.holdSlotByKey(cards, 'c1');
  // …the window passes, sweeps run, nothing happens to this slot…
  heldSlot.owner.unholdSlot(heldSlot);
  oimIsSlotReleased(heldSlot); // true — the give-back settles what the sweep could not
  ```

  A subscriber leaving is the other case: `unsubscribeFromSlot` stamps a whole fresh window
  first, so the last `disposeEffect(effect)` grants a full one.

- A cascade takes one sweep. A stale index goes on its
  own window, and giving back the hold it had on each entity is a departure that those entities'
  own expired windows already answer for, so they go in the same sweep.

### What a subscriber does

A subscriber is a hold. An effect takes a hold on each root it reads, and
`disposeEffect(effect)` gives it back, so a watched slot is a held slot, off the
clock like any other. The idle window therefore does not count subscribers; it
opens at the moment the last one leaves, as described above.

Neither window means unread: no read is reported to the clock. A subscriber
never loses data mid-read, because the hold refuses the release while the effect
is there. The last dispose has a different effect on each marker, which is why both ship:
`releaseDueAfterIdleMs` is re-stamped by that departure, so the slot gets a whole
fresh window, while `releaseDueAfterWriteMs` is not, so the slot gets only
what is left of the write window and an already-stale entity goes on that same call.
A hold blocks clearing the value as well as removing the identity.

A bucket runs its own window, given to its own collection. An index nothing
holds goes when that window runs out; an index something holds keeps every entity in
it whatever the entities' own age.

## Where to next

<DocCards>
<DocCard to="/docs/core/channel#the-frame" title="The channel: the frame">When a write is delivered: frames, the clock and subframes.</DocCard>
<DocCard to="/docs/core/model" title="The model">The four doors and the terms.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">Which door to take and what a write wakes.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Why a computed is pulled.</DocCard>
</DocCards>
