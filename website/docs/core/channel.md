---
sidebar_position: 5
title: 'The channel: frames and subframes'
description: How the channel slot stamps writes with its clock, which scheduler drives a flush, what one flush does in order, and how subframes and teardown work.
---

import FrameDemo from '@site/src/components/DocDemos/FrameDemo';

# The channel: frames and subframes

Every write goes through a channel slot. It stamps each write with its clock,
schedules the effects of the slot that moved, and delivers them together in
frames. Its scheduler, or your own `flush()`, decides when. The channel slot (`TOIMChannelSlot`) is the
state; `OIMChannelService.INSTANCE` is the stateless code that runs it, and every door on it takes the
channel slot first. `db.defaultChannelSlot` is the one every `createStoreSlot(db)` uses.

<InShort>

- Every write goes through a channel slot, which stamps it with its clock.
- The channel schedules the effects of the slot that moved and delivers them together in a frame.
- Its scheduler, or your own `flush()`, decides when a flush happens.
- Writes are refused while a frame runs; a write from an after-flush handler asks for the next frame.

</InShort>

```typescript setup
import {
    OIMChannelService,
    OIMDB,
    OIMEffectService,
    OIMErrorPolicyLogAndContinue,
    createOIMEntityService,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; title: string; rank: number };

const db = new OIMDB();
const channelSlot = db.defaultChannelSlot;
const channelService = OIMChannelService.INSTANCE;
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const cardContentService = cardService.slotContentService;

declare const slot: TOIMEntitySlot<Card, TOIMStoreKey>;
declare const paint: (card: Card | undefined) => void;
declare const report: (error: unknown) => void;
declare const measureAndScroll: () => void;
declare const whatJustHappened: () => unknown;
declare const somethingDerivedFrom: (work: unknown) => Card;
```

## The frame

A frame is one delivery: every effect whose sources moved since the last one
runs once, then the after-frame handlers run. A flush is one call of `flush()`:
it runs `onBeforeFlush` and a frame when anything is owed, then the unused-slot
collector gives back its holds and the after-each-flush handlers run. Writes
are cheap and often come in bursts, such as a response with a hundred entities or a
patch touching five columns. Delivering per write would run an effect once per
write. Delivering per frame runs it once per burst, and the scheduler decides
how long a burst is.

<FlushDiagram />

```typescript
const scheduledDb = new OIMDB({
    channelScheduler: (flush) => { void Promise.resolve().then(flush); },
    errorPolicy: new OIMErrorPolicyLogAndContinue({ onError: (error) => report(error) }),
    onBeforeFlush: () => { /* the flush has begun; read only, no writes */ },
});
```

| `OIMDB` option | What it is |
|---|---|
| `channelScheduler` | What defers a flush. Absent means you flush by hand: nothing is ever delivered until you call `db.flush()`. |
| `errorPolicy` | What a throw from `onBeforeFlush`, an effect or a handler does. Absent means `OIMErrorPolicyLogAndContinue.INSTANCE`: `console.error`, then its `onError`, and the frame goes on. `OIMErrorPolicyThrowAtOnce` throws the first one out of `flush()` instead. |
| `onBeforeFlush` | Called once at the start of a flush, immediately before the frame opens. It runs inside the flush, so a write from it is refused like any other. |

`db.flush()` is `OIMChannelService.INSTANCE.flush(db.defaultChannelSlot)`. A channel slot of your own is
`createOIMChannelSlot(options)`, over a clock and a collector slot.

### Schedulers

```typescript signature
type TOIMChannelScheduler = (flush: () => void) => void;
```

The scheduler is called with the flush when the first write of a batch
needs a frame, and is not called again until that frame has run. It decides
*when*: a microtask, an animation frame, a test's own step.

```typescript
const paintedDb = new OIMDB({
    channelScheduler: (flush) => { requestAnimationFrame(() => { flush(); }); },
});
const manualDb = new OIMDB();
manualDb.flush();
```

| Scheduler | A burst is |
|---|---|
| none | everything up to your `flush()` call — tests, servers, a batch you close by hand |
| `Promise.resolve().then(flush)` | one synchronous turn of the event loop |
| `requestAnimationFrame` | everything written before the next paint |

`TOIMChannelScheduler` returns nothing, so a
frame already asked for cannot be recalled. If you call `flush()` by hand before the scheduled
one arrives, the scheduled call has nothing to do: it runs only if a frame is
still owed. The channel does not depend on a timer API, so any host's deferral
plugs in.

A write nobody watches asks for no frame, unless an after-each-frame handler
is registered. A write schedules the slot's effects and asks for a frame only when
it found an effect, or when `subscribeAfterEachFrame` / `subscribeOnceAfterFrame` has a
handler waiting. Otherwise it advances the clock, stamps the slot and returns.

### The clock

<FrameDemo />

The channel slot keeps a clock, `channelSlot.clock` = `{ revision, epoch }` (the db's `db.clock`). Every
write moves it by one and stamps the written slot's `changedAtRevision` /
`changedAtEpoch`. A frame remembers the clock reading at which it opened. "Did this move
since…?" is then a comparison of two numbers, with no per-frame set of changed slots:

- A write schedules the slot's effects only the first time the slot moves in a
  frame. A second write to the same slot finds it already stamped after the frame
  opened and schedules nothing.
- An effect is scheduled once per frame, however many of its sources moved.
- Before running, an effect asks again whether any of its sources, or the roots
  under its computeds, moved since its own last run, so a computed whose value did
  not change keeps the effect asleep.

`channelService.isChangedInCurrentFrame(channelSlot, slot)` is that comparison as a public door. It
returns `true` when the slot's `changedAtRevision` / `changedAtEpoch` are after the clock reading
at which the last frame closed, meaning the slot was written since then. A frame carries
no number.

The revision wraps into the next epoch after 2^30 revisions
(`OIM_REVISIONS_PER_EPOCH`), so the comparison never overflows.

```ts
let runs = 0;
const king = cardContentService.upsertEntity(cards, { id: 'k', title: 'King', rank: 13 });
const kingEffect = effectService.createEffect(db, [king], [], () => { runs++; });
cardContentService.updateEntity(king, { title: 'Queen' });
cardContentService.updateEntity(king, { title: 'Jack' });
db.flush();
effectService.disposeEffect(kingEffect);
```

Two writes, one flush: `runs` is `1`.

### What one flush does, in order

1. `onBeforeFlush`, if the db was given one.
2. Every scheduled effect, each re-checking its sources first. A throw goes to the
   error policy. An effect counts as run only after its body returns, so a body
   that threw takes the same change again at its next wake.
3. The frame closes: its opening clock is set to now.
4. The `subscribeAfterEachFrame` / `subscribeOnceAfterFrame` handlers.
5. The flush ends: the unused-slot collector gives back this frame's reads, then the
   `subscribeAfterEachFlush` handlers run.

Writes are refused through steps 1–4 and the collector's give-back; a write from a
`subscribeAfterEachFlush` handler is accepted and asks for the next frame.

### The rules

Delivery is coalesced per effect per frame. However many writes touched its
sources between two flushes, an effect runs once.

Writes are refused for the whole flush, not only while the frame body is
running.

```
OIMChannelService: writes are refused for the whole of a flush — onBeforeFlush and every
after-each-frame handler included, not only the frame body. Write after flush()
returns.
```

A flush is in progress from before `onBeforeFlush` until the end of `flush()`, so
all three phases are refused: `onBeforeFlush`, every effect body, and every
after-each-frame handler. The after-each-frame phase is the one that catches people
out: the frame is over by then, and the write is still refused.

A door asks the channel slot once per entity it writes, before it touches the entity.
User code runs inside a door — `keyOf`, an index's `keyOf`,
`slotEmptiness.isEmpty`, any `IOIMEntityWriter` — and any of them may call
`flush()`, so each entity is a fresh question.

A subscriber is told during the frame, while the world is half built: the graph has not
advanced, the indexes have not settled, and the delivery list has already been
taken. A write from there would land in a frame that is no longer collecting, so
it is refused rather than half honoured. A handler in the tail is past that, but
the frame it would ask for cannot be opened from inside the flush that is still
running.

`flush()` inside a frame is refused for a stronger reason: a frame inside a
frame is not nested, it takes the outer one apart. The inner run would reset the
frame's opening clock while the outer is still delivering, so every later
per-frame comparison would use an opening clock that has already moved.

```
OIMChannelService.flush: a frame is already running, and a second one inside it would
end the first. …
```

`flush()` from the tail of a flush returns having done nothing. From
`onBeforeFlush`, from an after-each-frame handler, or from anything either of
them called, `flush` returns at once and no second frame runs. It is not a deferral and nothing is queued: one flush spends exactly one
frame, however many handlers ask for another.

To write in response to a change, wait until the flush has
ended. `onBeforeFlush`, effect bodies and after-each-frame handlers are not
places to write from. Two places are: an after-each-flush handler, and anything a tail
handler hands to later work:

```typescript
const stop = channelService.subscribeAfterEachFrame(channelSlot, () => {
    const work = whatJustHappened();
    void Promise.resolve().then(() => {
        cardContentService.upsertEntity(cards, somethingDerivedFrom(work));
    });
});
stop();
```

The microtask runs after `flush()` has returned, so the write is accepted and
asks for a frame of its own. A handler that calls `upsertEntity` directly throws,
and the refusal goes to the error policy. It is logged by default and thrown out of
`flush()` under `OIMErrorPolicyThrowAtOnce`.

### The subframe

A subframe is one logical change: the span in which a write is still landing.
Every write door opens one and closes it in a `finally`; a batch door opens one around
the whole batch, and the doors inside it nest. It exists because a `keyOf`, a
content-change listener or a sorter runs inside a write, and a frame closed from there
would deliver a half-applied write, with an entity out of one bucket and not yet in the
other. It is a counter, so nesting costs nothing and an outer door absorbs the inner
ones. Open one yourself to make several writes one change:

```ts
const jack = cardContentService.upsertEntity(cards, { id: 'j', title: 'Jack', rank: 11 });
channelService.openSubframe(channelSlot);
try {
    cardContentService.updateEntity(jack, { title: 'Jack of clubs' });
    cardContentService.upsertEntity(cards, { id: 't', title: 'Ten', rank: 10 });
} finally {
    channelService.closeSubframe(channelSlot);
}
db.flush();
```

The frame cannot close while a subframe is open. A frame is everything
delivered together; a subframe is one logical change inside it.
`openSubframe(channelSlot)` and `closeSubframe(channelSlot)` bracket it, and a write
that asks for a frame while one is open is owed it by the `closeSubframe` that
brings the count to zero. `flush()` called while a subframe is open throws
(`a subframe is open`), whether it comes from a `keyOf` or a listener that a write runs, or
from between your own open and close. Nothing is delivered and the write in progress
stays whole. The subframe is counted because it is routinely inside another one,
and it is closed from a `finally`, so a subframe that threw part-way still delivers what
landed. This is not the write guard seen from the other side: that guard refuses a *write*
made while a frame closes, and this one refuses a *frame* asked for while a subframe is open.

A subframe is also where per-entity work collapses into per-batch work.
`isSubframeOpen(channelSlot)` says whether one is open right now, and
`listChangedStoreSlot(channelSlot, storeSlot, subframeCloseListener)` lists a store slot together with the
`IOIMSubframeCloseListener` (`onStoreSlotSubframeClosed(storeSlot)`) that delivers its changes; the outermost
`closeSubframe` calls each listed listener with its store slot. The drain happens *before* the open count
drops, so a listener is still inside the subframe and still cannot close the frame. A store slot listed
during the drain is picked up by the same drain, and every listed entry runs. See
[Error handling](/docs/guides/error-handling) for what a throwing listener costs.
The bucket content services use this: a join or a leave records the bucket slot on its store slot's write
queues and lists that store slot, so filing a batch of entities touches each bucket's tail (the channel
write, the emptiness stamp, the release check) once per bucket instead of once per entity. Every bucket door
works this way (adds, removes, positional inserts and removes, moves, `writeBucketMemberSlots`,
`clearBucketMemberSlots`), and each opens a subframe of its own, so a lone door pays its tail at its own
close. The bucket's EMPTY flag is set at the door, so `hasSlotContentByKey` gives the right answer inside an
open batch. A move tells the release policy it was written, a door that changed nothing stamps nothing, and
a release asked for while the bucket has a pending change waits for the close. Commands are still recorded
at the door, where the position is true.

### Work that needs the whole settled frame

`subscribeOnceAfterFrame` is told after one frame, the first that ends after
the call, and is then gone. Where you call it decides which frame that is:

```typescript
effectService.createEffect(db, [slot], [], () => {
    paint(slot.entity);
    channelService.subscribeOnceAfterFrame(channelSlot, () => { measureAndScroll(); });
});
```

Registered from inside an effect body, it runs in the tail of that very frame,
after every other effect in it. The after-each-frame phase settles which handlers it owes
when the phase *begins*, and the drain comes before that. So a consumer whose work
needs the whole settled screen (a measurement, a scroll to an entity that moved, a
size written back) registers from inside its effect and is called at the end of that
same frame. Registered from the after-each-frame phase itself, it sits that frame
out and is told after the next.

Use it instead of `subscribeAfterEachFrame` plus a disposal. The effect runs again
next frame and registers again, so a standing handler accumulates one per run:
over three frames the one-shot is called 1, 2, 3 times and the standing handler
1, 3, 6 times. The one-shot also comes off before its body runs, so a handler that throws is not left
standing for the next frame. The frame that ran it reports the throw.

There is no second list. One-shot and standing handlers share the same set and
are called in registration order.

### After the flush has ended

```typescript
const stopAfterFlush = channelService.subscribeAfterEachFlush(channelSlot, () => {
    cardContentService.upsertEntity(cards, somethingDerivedFrom(whatJustHappened()));
});
stopAfterFlush();
```

`subscribeAfterEachFlush` is called from the flush's `finally`, after the frame,
after the after-each-frame phase, and after the unused-slot collector has given
its holds back. `isFlushing` is already lowered there, so a write is accepted
and lands in the next frame. It runs after every `flush()`, including one that had
nothing to deliver. Use it for state that must live exactly one frame:
`OIMBucketCommands` resets the recorded commands of the buckets that recorded here, and
`exoPositionalList` in `@oimdb/exodra` resets its applied-command count. A throw
from a handler goes to the error policy, and the handlers after it still run.

A derivation is asked and receives no delivery. Nothing schedules a
computed slot and no frame walks to one. An effect that reads it settles it on
its way to deciding whether to run. See
[The compute graph](/docs/core/computed-effects).

Nothing is settled ahead of an arriving consumer, because nothing defers. An
ordered bucket's order is produced by the read that asks for it, so every
identity is current at every instant, and a subscriber who arrives after this
frame's write sees the same thing as one who subscribed before it.

For a filtered wake on an ordered bucket, use
`createOIMComputedServiceBucketMemo`, which asks the same question where the answer
is known.

By default, one throwing handler does not abort the frame. The throw goes to
the error policy. Under the default policy it is logged and handed to `onError`, and the
rest of that frame's deliveries still happen. Under `OIMErrorPolicyThrowAtOnce` it
leaves `flush()` at once, and the deliveries not yet made wait for the next flush.
A policy is one method, `onErrorCaught(error)`, so an object literal
`{ onErrorCaught: (error) => { … } }` is a policy too (`IOIMErrorPolicy`).

A comparator that throws is rethrown at the reader that asked, out of the
`getValueForSlot` of a sorted list built by `createOIMComputedServiceSorted`, because the sort
runs inside that computed's derive. A bucket never sorts, so its own reads cannot throw
for an order.

## Dropping the whole channel

Every give-back above ends one reference, which is what the end of one
subscription is. When everything ends, for example when the screen closes or the request has
been answered, the whole channel goes at once:

```typescript
channelService.dropChannelSlot(channelSlot);
// then drop your own references; every slot, store and derivation goes with them
```

The precondition is yours to hold: nothing may be subscribed to anything on
this channel slot. The engine does not check it, because asking "is anybody watching"
means asking every slot for its `effects` list, which is the walk this method
exists to skip.

What the call does: it sets a flag, cancels the schedule it armed, gives back the
unused-slot collector's holds, empties the list of pending effects, the
after-each-frame handlers and the after-each-flush handlers, and returns.
Nothing walks a slot to ask who is subscribed to it: an effect filed on a slot before
the call is still filed on it after, and every one of those objects is garbage
together once you drop your references.

The unused-slot collector is the one thing it does hand back, because that
one is the channel's own debt rather than part of your graph. A getter that mints an
identity files a hold with the collector, and the only thing that ever gave those
holds back was the `finally` of a flush. A dropped channel never reaches it,
since `flush()` returns on the flag first. Skipping the give-back would pin every identity
minted since the last frame for as long as the db's collector slot lives. The
list it walks is only what this frame minted, not every slot you own. A drop made
from inside a flush leaves the give-back to that flush's `finally`, which still
runs.

The flag is there because a frame already asked for cannot be recalled.
`TOIMChannelScheduler` takes a callback and hands back no handle, so a flush this
channel asked for before the call still arrives afterwards. `flush()` returns
on the flag rather than delivering to a torn-down screen. Writes also stop asking
for new frames, so a dropped screen does not schedule work on its host while
anything still writes to it.

A write after the call is not refused. It advances the clock, stamps the slot and
schedules the dependents it finds, and then asks for no frame, so nothing it
scheduled is ever delivered.

Called with subscribers still standing, their bodies never run again, and nothing
is thrown or reported. Calling it a second time is safe.

There is no checked variant of this call: a checked destroy would pay exactly the
walk this one skips.

Dropping a channel releases no single slot: a slot goes when a subscriber, a value
and a bucket have all left, and nothing may ask for one slot to go. This is the
level above: the whole channel, and everything filed under it, at once. See
[a slot goes when nothing refers to it](/docs/core/model#a-slot-goes-when-nothing-refers-to-it).

## Where to next

<DocCards>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Reads, effects and columns.</DocCard>
<DocCard to="/docs/core/lifecycle" title="Slot lifecycle">When an identity goes, and the release clocks.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">Which door to take and what a write wakes.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Why a computed is pulled.</DocCard>
</DocCards>
