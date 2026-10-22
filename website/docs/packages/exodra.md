---
sidebar_position: 5
description: How @oimdb/exodra binds engine slots to Exodra with exoBinding, exoFollowKey, exoCombine, exoRows and exoSource, and how its two list arms differ.
---

# Exodra

`@oimdb/exodra` is the [Exodra](https://exodra.org) counterpart of
[`@oimdb/react`](/docs/packages/react). The React package turns an OIMDB
source into a hook plus a re-render. This one turns it into a read-only Exodra
bindable (`TExoBindable`) or list (`TExoBindableList`), with no React, no hooks
and no re-renders.

<InShort>

- `@oimdb/exodra` turns an OIMDB source into a read-only Exodra bindable or list.
- `exoBinding` is the one door from the engine.
- `exoFollowKey`, `exoCombine` and `exoRows` cover a moving key, fan-in and identity-stable children.
- Lists are a fork, and both arms ship.

</InShort>

Not yet published. See [Installation](../getting-started/installation.md).

The bridge depends only on the type-only `@exodra/reactivity-types`, never on the
reactivity runtime. Your Exodra app already provides `@exodra/reactivity` for
`bindable`, `derive` and `h`.

## Which function for which task

| You want to bind… | Take | What it hands back |
|---|---|---|
| one entity, one column, a bucket's slots, or a derived value | `exoBinding` | `TExoBindable` |
| a value that follows a key which itself changes (the selected deck) | `exoFollowKey` | `TExoBindable` |
| one value computed from several bindables, possibly from outside this engine | `exoCombine` | `TExoBindable` |
| a list of children, one rendered object per key, kept across changes | `exoRows` | `TExoBindable` of an array |
| a list whose order the engine derives (a sorted computed, a bucket memo) | `exoDerivedList` | `TOIMExoList` — a `TExoBindableList` with insert/remove/move ops |
| a list whose positions your code sets (`OIMBucketCommands`) | `exoPositionalList` | `TOIMExoList` |
| a source that is not this engine at all | `exoSource` | `TExoBindable` |

**When to take this package and when not.** Take it when the view layer is
Exodra: the view's own reactive graph reads a bindable, so a changed entity
updates the nodes bound to it and nothing re-renders. In React, take
[`@oimdb/react`](/docs/packages/react) instead; for a Redux reader,
[`@oimdb/redux-adapter`](/docs/packages/redux-adapter). Among the list
functions, `exoRows` re-reads a key array and reconciles by key, while the two
`TOIMExoList` bridges forward position ops. Pick an op-stream bridge when the
consumer can apply ops, and `exoRows` when it wants a fresh array.

```ts setup
import {
    OIMDB, createOIMEntityService, createOIMBucketService, createOIMComputedServiceBucketMemo,
} from '@oimdb/core';
import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
    exoBinding, exoSource, exoCombine, exoFollowKey, exoRows, exoDerivedList, exoPositionalList,
} from '@oimdb/exodra';
import type { TExoBindable } from '@exodra/reactivity-types';

type Card = { id: string; title: string; deck: string };

const db = new OIMDB();
const cardService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
const cards = cardService.createStoreSlot(db);
const slot = cardService.getSlotByKey(cards, 'c1');
const byDeckService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const byDeck = byDeckService.createStoreSlot(db);
const bucket = byDeckService.getSlotByKey(byDeck, 'spades');
const orderService = createOIMComputedServiceBucketMemo({
    bucketCollectionService: byDeckService,
});
const order = orderService.createBucketMemoStoreSlot(byDeck);
const orders = orderService.computedCollectionService;
const boardService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const boards = boardService.createStoreSlot(db);

const renderCard = (cardSlot: TOIMEntitySlot): string => String(cardSlot.key);
const entity = exoBinding(db, {
    sourceSlots: [slot],
    derive: () => slot.entity,
});
const selectedDeck: TExoBindable<string> = exoSource(() => 'spades', () => () => {});
const highlighted: TExoBindable<boolean> = exoSource(() => false, () => () => {});
const deckIds: TExoBindable<readonly string[]> = exoSource(() => ['spades'], () => () => {});
```

## One door from the engine: `exoBinding`

A subscription in this core is **one call**, `OIMEffectService.INSTANCE.createEffect(db,
sourceSlots, sourceComputeds, body)`, and the value it produces is read off the slots afterwards
instead of being carried by the subscription. The effect service is stateless: the `db` passed
first is the channel map, and its `defaultChannelSlot` is the channel the effect runs on. So
there is one adapter, it takes that same `db` first, and one entity, one column, a bucket's
slots and a derived value all come through it.

```typescript
// One entity.
const cardEntity = exoBinding(db, {
    sourceSlots: [slot],
    derive: () => slot.entity,
});

// A bucket's slots. `getBucketMemberSlots` hands back the LIVE container, so copy it.
const deckCards = exoBinding(db, {
    sourceSlots: [bucket],
    derive: () => Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket)),
});

// A derivation — the order of a bucket, a filtered page, an auto index.
const deck = orders.holdSlotByKey(order, 'spades');
const ordered = exoBinding(db, {
    sourceComputeds: [deck],
    derive: () => deck.computedValueService.getValueForSlot(deck),
});
```

`TOIMExoBinding<TValue>` is that argument: `sourceSlots?` (roots a write can reach),
`sourceComputeds?` (derivations this reads) and `derive`. Both source keys are
optional and default to none.

```typescript signature
export type TOIMExoBinding<TValue> = {
    readonly sourceSlots?: readonly TOIMSlot[] | undefined;
    readonly sourceComputeds?: readonly TOIMComputedSlot[] | undefined;
    readonly derive: () => TValue;
};
```

`sourceComputeds` is `readonly TOIMComputedSlot[]`: slots taken from a computed service's
`computedCollectionService`, e.g. `orders.holdSlotByKey(order, 'spades')`.

`exoBinding(db, binding)` takes the same arguments as `createEffect` and returns a `TExoBindable`.
There is no intermediate observable type.

It takes over two things that would otherwise sit unchecked at every call site,
and each of them fails **silently**:

| | what goes wrong without it |
|---|---|
| **settles every derivation before the read** | a derivation is asked and never woken, so `computedSlot.value` alone is whatever the last settle left there — on a first read, the value it was born with |
| **one effect per bindable** | ref-counted through `exoSource`: none while nobody listens, one however many subscribers there are |

### Lifetime is the caller's

`exoBinding` **holds nothing**. A bindable is lazy (its effect exists only while
somebody is subscribed), so it outlives its own subscriptions, and a hold scoped
to one of them buys nothing. The give-back, `slot.owner.unholdSlot(slot)`, ends in
`releaseSlotIfUnheld`, so returning it at teardown leaves exactly the state the
teardown would have left anyway.

Whoever **resolved** the identity therefore holds it for as long as the bindable
lives, and says so by handing back a `TOIMExoDisposable<TValue>`, which is
`TExoBindable<TValue> & { readonly dispose: TOIMDisposer }`:

```typescript
const groupFor = (deckId: TOIMStoreKey) => {
    const held = orders.holdSlotByKey(order, deckId);     // a hold is what mints one
    return Object.assign(
        exoBinding(db, {
            sourceComputeds: [held], derive: () => held.computedValueService.getValueForSlot(held),
        }),
        { dispose: () => held.owner.unholdSlot(held) },
    );
};
```

Under the default policy of entity and bucket services,
`OIMSlotReleasePolicyAtEmpty`, getting this wrong exposes only a **valueless**
identity: an empty bucket, a key resolved before its entity arrived, or an
entity since removed. A slot holding a value is kept by that value. A computed slot
is different: `OIMComputedService` defaults to `OIMSlotReleasePolicyAtUnhold`
and never counts as empty, so an unheld, unsubscribed derivation goes whatever it
holds. That is why every example above holds the computed it binds.

## `exoFollowKey` — a bindable driven by a moving key

```typescript
const selected = exoFollowKey(selectedDeck, (deckId) => {
    const held = orders.holdSlotByKey(order, deckId);
    return Object.assign(
        exoBinding(db, {
            sourceComputeds: [held], derive: () => held.computedValueService.getValueForSlot(held),
        }),
        { dispose: () => held.owner.unholdSlot(held) },
    );
});
```

`makeBindable` is re-run whenever the key bindable changes, so a view follows a
selection without being rebuilt. No core primitive repoints a live subscription
as a key moves on its own.

The factory must hand back a `TOIMExoDisposable`, because repointing has to give
the previous key's handle back. Unsubscribing does not cover it, since a
subscription's disposer returns the subscription and nothing else. Unsubscribed
reads are memoised on the key: one live handle at a time, given back the moment
the key moves off it or the last subscriber leaves.

## `exoCombine` — fan-in across anything

```typescript
const label = exoCombine([entity, highlighted], () =>
    `${entity.getValue()?.title ?? ''}${highlighted.getValue() ? '*' : ''}`);
```

Exodra's `derive` is single-source. A computed combines too, but only for
sources inside one channel's graph, and unlike `exoCombine` it is glitch-free. Use
`exoCombine` where a view mixes an `exoBinding` with local UI state or with a
second channel. Keep heavy fan-in inside one computed and forward it with
`exoBinding`.

The **first** emit after subscribing always propagates, on purpose. A binding is
normally built from `getValue()` first and wired a moment later, and anything that
changed in between is only recoverable through that first emit. Later emits are
deduped by `Object.is`.

## `exoRows` — identity-stable children from keys

```typescript
const rows = exoRows(deckIds, (deckId) => {
    const held = orders.holdSlotByKey(order, deckId);
    const deckCards = exoBinding(db, {
        sourceComputeds: [held], derive: () => held.computedValueService.getValueForSlot(held),
    });
    return { schema: { deckId, cards: deckCards }, dispose: () => held.owner.unholdSlot(held) };
});
```

Exodra reconciles children by object **identity**, and a raw entity reference is
not a reliable "same entity?" test: an in-place write never replaces it, a replacing
write always does. So a primary key identifies an entity, each key's schema is
rendered once and cached, and a change to the bucket's slots rebuilds from that
cache.

`render` returns a `TOIMExoRenderedRow<TSchema>`, which is `{ schema, dispose }`,
for the same reason `exoFollowKey`'s factory is narrowed. A schema is a tree the
caller builds, and on every real path that tree holds core references that
nothing else counts. `exoRows` must never look inside a schema to find out what.
The `dispose` is the whole row's, so a row holding three derivations gives back
three holds in one function, and a row that holds nothing writes
`dispose: () => {}`.

Keys must be unique. Uniqueness is decided over the **whole sequence before
anything is rendered**, so a refused read has rendered nothing, cached nothing and
moved nothing.

## Lists are a fork, and both arms ship

**Who decides the order** is the whole difference. The engine's order is a
derivation of entity slots: `createOIMComputedServiceSorted` over an index, or
`createOIMComputedServiceBucketMemo` over a bucket. The caller's order is a bucket under
`OIMBucketCommands`, which keeps the positions it is given. Which arm applies
depends on which of the two you hand the bridge.

```typescript
// The ENGINE orders it: the script is DERIVED, by oimOrderedListCommandsOfTransition.
const deck = orders.holdSlotByKey(order, 'spades');
const list = exoDerivedList(db, deck, renderCard);

// YOU order it: the script is the one OIMBucketCommands already RECORDED.
const boardBucket = boardService.holdSlotByKey(boards, 'board');
const board = exoPositionalList(db, boardService.slotContentService, boardBucket, renderCard);
```

`exoDerivedList(db, computedSlot, render, maxCommandsPerSlot?)` takes a `TOIMComputedSlot` of
`readonly TOIMEntitySlot[]`, one held from `createOIMComputedServiceSorted`,
`createOIMComputedServiceBucketMemo`, or a computed service of your own. It reads the list through
`computedSlot.computedValueService.getValueForSlot(computedSlot)`. A frame that
moved the list costs one `oimOrderedListCommandsOfTransition`: a pass over both lists, a
longest-increasing-subsequence pass, and `common − LIS` moves, which is the
optimum. A quiet frame costs nothing, because the effect does not run.

`exoPositionalList(db, slotContentBucketService, bucketSlot, render)` costs
nothing at all. It takes the bucket collection's **content service**
(`boardService.slotContentService`), which holds the bucket's slots and its reads. That
content service must be built with an `OIMBucketCommands` as its `bucketCommands`, which is
what `createOIMBucketService(db)` gives when you pass no `slotContentService`: its default
is the array-driven content service with commands.
`OIMBucketCommands` recorded `insertBucketMemberSlotAt`,
`moveBucketMemberSlotToPosition`, `removeBucketMemberSlotRange` and the rest on the bucket slot
(`bucket.commands`, `bucket.isWholeListRecorded`) as this frame's script, and the
bridge forwards it from inside the frame. The script is cleared once the flush
that delivered it has ended.

Both hand back a `TOIMExoList<TSchema>`, which is a `TExoBindableList` plus a `dispose`.

### One baseline, in one place

Both bridges are **attached from construction**, not from their first subscriber.
That is what lets `snapshot()` promise the list that every later op is measured
against. It is the same variable the diff (or the applier) advances, moved in one
place, so a consumer that starts from the snapshot and applies every op can never
be one place off. A bridge that armed itself with its first subscriber would hand
a re-subscriber the list as it stood some frames ago, without saying so.

**One baseline, and only one.** If you read the bucket's slots directly *as well as*
the command stream, you get two baselines over one bucket, and they agree only at
frame boundaries. An entity slot written and not yet flushed is already in `snapshot()` and
then arrives a second time as an `insert`, which puts every position-addressed
command after it one place off.

### Rows survive a `reset`

Each entity slot's schema is memoised in a `WeakMap` inside the bridge. A `reset`, the
one command carrying a whole list, therefore hands back the very objects the previous
snapshot did, and an identity-reconciling renderer moves rows instead of remaking
them. The entry goes when the slot does, so there is nothing to sweep.

The core's commands are **narrower** than Exodra's `TExoListOp`. There is no `set`
(a content change is not a position change, so bind an entity's content reactively
inside `render`) and no `count` on `remove`/`move` (it is always exactly one slot).
Both fields are simply left absent.

## The base primitive: `exoSource`

Every derived bindable above that shares work across several downstream
subscribers is built on `exoSource(read, subscribe)`. It is lazy and ref-counted
(the upstream `subscribe` runs only while at least one downstream subscriber
exists), and SSR-safe (`getValue()` reads through with no subscription at all).
There is no equality option, because `subscribe` is a callback you write. A caller
that wants no-op emits dropped compares inside it and does not call `onChange`.

It stays exported for what it is *for*: a source that is **not** this engine's,
such as a DOM target, an event emitter or a second runtime.

`TOIMExoReadable<TValue>`, which is `{ getValue(): TValue; subscribe(update: () => void): () => void }`,
is the minimal input shape the bridge accepts. It is deliberately decoupled from
Exodra's own event generic, so a writable bindable is still a valid input.

## Export reference

**Functions:** `exoBinding`, `exoSource`, `exoCombine`, `exoFollowKey`,
`exoRows`, `exoDerivedList`, `exoPositionalList`.

**Types:** `TOIMExoBinding`, `TOIMExoReadable`, `TOIMExoDisposable`,
`TOIMExoRenderedRow`, `TOIMExoList`.

That is the whole surface. The package exports nothing that is not on this list.
