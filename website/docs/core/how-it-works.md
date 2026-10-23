---
sidebar_position: 1.5
title: How it works, and why
description: The design of the engine in one page — identities, slots, owners, frames, push and pull, lifetime — and the reason behind each choice.
---

# How it works, and why

Each page of Core concepts describes one part. This page puts the parts together:
what the engine does with a write, a read and a subscription, and why each piece has
the shape it has. Each section ends with a link to the page that covers it in full.

<InShort>

- A key is resolved to its slot once, and reads, writes and subscriptions then go through that slot.
- A slot is a plain object, and its owner is its only writer.
- A write marks and a frame delivers.
- Membership is pushed, order and derived values are pulled, and lifetime is counted.

</InShort>

## A key is resolved once, then everything works through an identity

A lookup by key is not free: a store that answers every read, every write and every
subscription check through a `Map` pays for that lookup each time. OIMDB resolves a key
to a **slot** (one object per key per collection) once, at the first door that
names the key. From then on, reads, writes and subscriptions go through the slot.
A subscriber hangs on the slot itself, so a write to one entity reaches exactly the
effects filed on that entity, with no lookup and no scan of other subscribers.

Minting a slot costs more than putting a value in a map. The design bets that this
price is paid back, because whatever is created is something a screen shows, reads and
updates. How far it is paid back, task by task, is in the [results](/docs/benchmarks/results).

[The model](/docs/core/model) · [Collections and identities](/docs/core/collections)

## A slot is a plain object, and its owner is its only writer

A slot is a plain object built by one function per kind, with every field it will
ever carry present at birth. Every field is `readonly` in its type; only the
service that owns the slot (reached as `slot.owner`) writes it, through
`TOIMSlotEditable`. Callers ask the owner — `holdSlot`, `unholdSlot`, a write door —
and never set a field.

Two reasons, one about correctness and one about speed:

- **One mutator per field.** A count, a stamp and a flag are data like any other. A
  field that several places can write is a field whose invariants nobody owns.
- **Few shapes at the hot doors.** V8 reads a field at a fixed offset when every
  object reaching a call site shares a hidden class, and gives up past four shapes.
  A slot born whole, never grown and never `delete`d keeps one hidden class per kind,
  so the hottest doors see at most four.

[Architecture — a slot and object shapes](/docs/core/architecture#a-slot)

## A service is the aggregate, and its strategies are injected once

A service is one class per type of slot that owns its slots and every operation that
changes them. A collection is one instance of that type: a store slot the service
creates, which carries the store. The store sits behind a stateless slot store
service (a `Map` or a key tree), and the service is the only one that reaches it. Every trade-off with two defensible answers — copy or mutate on write, a set or an
ordered array for a bucket, how long an unused slot is kept — is a strategy object
handed to the constructor. The object already is the answer, so no write path
branches on a flag.

[The model — forks are strategies](/docs/core/model#forks-are-strategies-chosen-at-construction) ·
[Architecture — where a strategy is picked](/docs/core/architecture#where-a-strategy-is-picked-at-construction)

## A write marks; a frame delivers

A write changes the slot, advances the channel's clock by one and stamps the slot with
it, and schedules the effects filed on the slot, but only the first time the slot moves in the
frame. It runs nothing. `flush()` (or the channel's scheduler) runs each
scheduled effect once, after checking again that one of its sources moved since its
own last run.

- **Why frames:** writes come in bursts. Ten writes to one entity before a flush cost
  ten stamps and one delivery; an effect over several entities that all moved runs
  once.
- **Why a clock and not a set of changed slots:** "did this move since…?" becomes a
  comparison of two numbers stored on the slot.
- **Why subframes:** a write runs user code (a `keyOf`, a listener) while it is
  still landing. A frame closed from there would deliver a half-applied write, so a
  frame cannot close while a subframe is open, and a batch is one subframe whose
  per-bucket work runs once at its close.

[The channel: frames and subframes](/docs/core/channel)

## Membership is pushed; order and derived values are pulled

A **computed** is pulled: it is derived when a reader asks for its value, and only if
one of its sources moved. It learns *that* a source changed, never *what*, and its
sources are fixed when it is created. That suits a derived value but not
membership: a computed "cards of the red deck" either never sees a card inserted
later or rescans every card on every frame.

So **membership is a bucket, pushed**: an `OIMIndexService` listens to its source collection,
and each write costs one `keyOf`, one read of the key cached on the slot and at most
two bucket edits, whatever the size of the collection.

And **order is a computed over the bucket**: a sort is needed once per read, not once
per write, and a bucket nobody renders sorted is never sorted. The sorted view
starts from its previous array (survivors keep their place, arrivals are appended)
and sorts an array that is already nearly in order. A result in the same order keeps
the previous array, so nothing downstream wakes.

[Why an index looks like this](/docs/core/index-shape) ·
[The compute graph](/docs/core/computed-effects)

## Lifetime is counted, never commanded

Nothing in the public API releases a slot. Each door that mints a slot also determines what
keeps it: the unused-slot collector for a getter (until the next flush), the
caller for a hold, the value for a write, the effect for a subscription. When the last of those lets go, the slot is
asked to go, and the service's release policy
decides. By default an entity or a bucket stays while it has a value and goes when
it is empty and unheld. A computed goes when nothing holds it, because it can be
derived again.

- **Why no release command:** it would let one caller drop an identity another
  caller is still subscribed to. Counting references lets the owner answer "does
  anything refer to it" in one place.
- **Why a policy object:** how long data is worth keeping is a property of the
  type of data, chosen once per service: keep what was written, drop what can be recomputed, keep
  a remote list for a while after the screen closes.

A released slot is dead and every door on it throws, but the key is not dead: the next door
for it mints a new slot. Keep the service and the store slot, not the slot.

[Slot lifecycle](/docs/core/lifecycle)

## What this buys, and what it costs

- **A write reaches only its own subscribers:** it touches the slot and the effects on
  it; an unrelated entity's subscribers are never called, and no table is copied.
- **An insert does more work than a map entry:** it mints a slot and files it.
  Neither point makes updates cheaper than inserts as a rule. The measured cost of
  each task, insert or update, is in the [results](/docs/benchmarks/results).
- **The bundle is larger than a bare store,** because grouping, ordering, batching
  and memory management are inside it. See [Why OIMDB](/docs/why-oimdb).

## Where to next

<DocCards>
<DocCard to="/docs/core/model" title="The model">The three kinds of slot, the four doors and the root.</DocCard>
<DocCard to="/docs/recipes" title="Recipes">The same mechanisms applied to concrete tasks.</DocCard>
<DocCard to="/docs/core/architecture" title="Architecture">Where each piece lives in the source.</DocCard>
</DocCards>
