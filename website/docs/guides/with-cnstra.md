---
sidebar_position: 0
description: How to let cnstra drive OIMDB delivery with one line instead of a scheduler, and which scheduler to pick at construction without cnstra.
---

# Delivery with cnstra: one line, no scheduler

`OIMDB` has no default scheduler, and that is on purpose. With no `channelScheduler`
option nothing is delivered until `db.flush()` runs, so the only question is WHO
calls it, and when. In an application, the orchestrator does.

<InShort>

- `OIMDB` has no default scheduler on purpose.
- With no `channelScheduler` option nothing is delivered until `db.flush()` runs.
- cnstra calls a drain listener at the end of every synchronous turn, so `db.flush()` there is the one commit point.
- Without cnstra, a scheduler is chosen at construction.

</InShort>

```ts setup
import { OIMDB, OIMEffectService, createOIMEntityService, createOIMIndexService } from '@oimdb/core';

type Card = { id: string; deck: string; title: string };

declare const cns: { addDrainListener(listener: () => void): () => void };
declare function fetchDeck(deck: string): Promise<Card[]>;

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const byDeckService = createOIMIndexService(db, { entityService: cardService, keyOf: (card: Card) => card.deck });
const byDeck = byDeckService.createIndexStoreSlot(cards);
const loadingService = createOIMEntityService<{ deck: string }>(db, { keyOf: (loadingDeck) => loadingDeck.deck });
const loading = loadingService.createStoreSlot(db);
```

## The wiring

cnstra calls a drain listener at the end of every synchronous turn of every
stimulation. Make that the one commit point of the whole application:

```ts
cns.addDrainListener(() => db.flush());
```

That is all of it. Application code carries no `flush()` call anywhere.

## What it buys

- **One frame per turn.** Every write a stimulation makes in one synchronous turn
  lands in one frame; each effect runs at most once for it, synchronously, at the
  end of the turn. No microtask, no timer, no frame split in the middle of a
  logical change.
- **Loading first, data later, with the same line.** A turn that awaits ends
  early, and the drain flushes what it wrote so far. When the promise settles, the
  next turn writes the result and the next drain flushes that. The body of a
  domain neuron reads as plain code:

```ts
async function loadDeck(deck: string): Promise<void> {
    const loadingSlot = loadingService.slotContentService.upsertEntity(loading, { deck });
    const fetched = await fetchDeck(deck);
    cardService.slotContentService.upsertEntities(cards, fetched);
    loadingService.slotContentService.deleteEntity(loadingSlot);
}
```

  The first drain delivers the loading entity; the second delivers the cards and its
  removal. Nothing in the neuron or the view handles the two frames: the drains
  already are them.

## The rule this rests on

**Every mutation goes through a domain neuron.** A write made outside cnstra — from
a click handler, a socket callback, a timer — is not something the engine papers
over with a fallback scheduler. It is the mistake cnstra exists to prevent. Route
the event into a stimulation and let the neuron write.

## Why not a default scheduler

A scheduler in the engine decides on its own when to deliver, so it cuts a
stimulation's turn into frames wherever its clock happens to fire. Manual `flush()`
leaves that decision to the one party that knows where a unit of work ends. Tests
call `db.flush()` themselves; applications hand it to the drain.

The mechanism is in the core, not in an integration: a write asks the channel
for a flush, and with no `channelScheduler` the channel slot has no timer to put that
request on, so the request is dropped and the pending effects wait
(`OIMChannelService.requestFlush`, `OIMFlushSchedulerService.schedule`). `flush()` then runs
them all in one frame, whenever it is called.

## Without cnstra: a scheduler, chosen at construction

When there is no orchestrator to own the turn, give the channel a scheduler
instead. A `TOIMChannelScheduler` is `(flush: () => void) => void`: the channel
calls it once when the first write of a frame asks for a flush, and the scheduler
decides when `flush` runs. A microtask gives one frame per synchronous turn of
plain JavaScript:

```ts
const scheduledDb = new OIMDB({ channelScheduler: flush => queueMicrotask(flush) });
```

That is the other arm of the same fork. It is picked once, when the database
is built, and the write path does not ask which arm it is on. The scheduler arm
costs what was named above: it ends a frame wherever its own clock
fires, which for a microtask is at the first `await`, so a logical change that
spans an `await` is delivered as two frames. Under cnstra the same split happens,
but the orchestrator's turn boundary decides it, not a timer. A
`flush()` called while a scheduled one is pending runs the frame at once; the
scheduled call then finds no flush requested and returns
(`OIMFlushSchedulerService.onSchedulerTimerFired`).

If `flush()` runs from a scheduler callback, an `OIMErrorPolicyThrowAtOnce`
throw has no synchronous caller to land in — see
[Error handling](/docs/guides/error-handling).

## Subscriptions

Subscriptions work as before: a view subscribes to a bucket for its list and
to each entity's own slot. See [buckets](/docs/core/indexes).

```ts
const spades = byDeckService.getSlotByKey(byDeck, 'spades');
effectService.createEffect(db, [spades], [], () => console.log(byDeckService.slotContentService.getBucketMemberSlotCount(spades)));
```
