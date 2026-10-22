---
sidebar_position: 9
description: How computeds are pulled and effects are woken, how sameValueGuard short-circuits a derivation, and how to build keyed and unkeyed derivations.
---

# The compute graph

There are two kinds of node:

- A computed is a slot (`TOIMComputedSlot`) that publishes a value. It is refreshed when a reader asks for the value.
- A `TOIMEffect` publishes nothing. A frame runs it, through `OIMEffectService.INSTANCE`.

<InShort>

- A computed is a slot that is refreshed when a reader asks for its value, so it is pulled.
- An effect is run by a frame when one of its sources moved.
- A derivation can have no key or one value per key, and both shapes are store slots of one `OIMComputedService`.
- The order of a bucket is a derivation.

</InShort>

| You want | Take | Not |
|---|---|---|
| one derived value with no key (a total, a flag, a summary) | `createOIMComputedService<void, V, TOIMSingleSlotStore<…>>({ computedSlotStoreService: OIMSlotStoreServiceSingleSlotDriven.INSTANCE })` and its `createComputedStoreSlot(db, derive, createSources)`, read under the key `undefined` | a Map computed store slot read under a constant key |
| one derived value per key (per card, per deck, per user) | `createOIMComputedService<K, V>({ … })` and its `createComputedStoreSlot(db, derive, createSources)` | one single computed per key held in a `Map` of your own |
| a bucket's members as an array, in the order the caller wrote | `createOIMComputedServiceBucketMemo` and its `createBucketMemoStoreSlot(bucketStoreSlot)` | a computed that copies the bucket by hand |
| an index's members sorted | `createOIMComputedServiceSorted` and its `createSortedStoreSlot(indexStoreSlot)` | sorting inside an effect body on every run |
| something to happen when data moves (render, log, sync) | `effectService.createEffect` / `createEffectImmediate` | a computed whose `derive` has side effects |
| something to happen when one column of one entity moves | `effectService.createEffect(db, [column], [], body)` | an effect over the whole entity slot |

```ts setup
import {
    OIMDB,
    OIMEffectService,
    OIMSlotReleasePolicyNever,
    OIMSlotStoreServiceSingleSlotDriven,
    createOIMBucketService,
    createOIMComputedService,
    createOIMComputedServiceBucketMemo,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMIndexService,
    oimSameValueZeroGuard,
    type TOIMComputedSlot,
    type TOIMEntitySlot,
    type TOIMSingleSlotStore,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; title: string; rank: number };

declare function use(value: number): void;
declare function render(value?: unknown): void;

function singleSlotStoreService<TValue>() {
    return OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<TValue, void>>;
}

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const slot = cardService.getSlotByKey(cards, 'c1');
const other = cardService.getSlotByKey(cards, 'c2');

const totalService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService: singleSlotStoreService<number>(),
});
const total = totalService.createComputedStoreSlot(
    db,
    () => (slot.entity?.rank ?? 0) + (other.entity?.rank ?? 0),
    () => ({ sourceSlots: [slot, other] }),
);
const totalSlot = totalService.computedCollectionService.getSlotByKey(total, undefined);
```

## A derivation is a slot that nothing marks

```ts
const rankService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService: singleSlotStoreService<number>(),
    sameValueGuard: oimSameValueZeroGuard,    // did the derived value move?
});
const rank = rankService.createComputedStoreSlot(
    db,
    () => slot.entity?.rank ?? 0,
    () => ({
        sourceSlots: [slot],     // the root slots it reads
    }),
);

const rankSlot = rankService.computedCollectionService.getSlotByKey(rank, undefined);
rankSlot.computedValueService.getValueForSlot(rankSlot);      // settles, then answers
```

`createSources` returns `sourceSlots` (the root slots it reads) and `sourceComputeds` (the derivations it reads). Both keys are optional; a missing one means none.

A computed is the plain data type `TOIMComputedSlot<TValue, TKey>`: `value`,
`sourceSlots`, `sourceComputeds`, `owner`, `computedValueService` and the usual slot fields. Its owner is
the slot owner of the collection that minted it, and the owner is the only writer of the slot. The
value service (`OIMComputedValueService`) holds the `sameValueGuard` once, the store slot
holds its own `derive` and `createSources` (or the service does, for every store
slot that was given none) and its channel slot's clock, and the value service serves the value:
`computedSlot.computedValueService.getValueForSlot(computedSlot)`. Every computed value service
implements `IOIMComputedValueService<TValue>`, whose one method is
`getValueForSlot(computedSlot)` — that is how a reader that holds only the slot
(an effect, another computed) settles it.

Read the value through the value service, not as `computedSlot.value`. The field
compiles, but reading it settles nothing: it is whatever the last read left there.
Inside an effect body it happens to be fresh, because the effect settles every
computed it names before it decides to run; anywhere else it may be stale.

Nothing schedules or marks a computed, and no frame walks to it. Whoever wants
its value asks it: an effect deciding whether to run its body, or another
computed doing the same. That is the whole lifecycle.

Creating a service or a store slot takes no hold. The owner takes the holds when it mints a slot:
it takes `owner.holdSlot` on each slot in `computedSlot.sourceSlots` and
`computedSlot.sourceComputeds`, and it gives exactly those back when it releases
that slot. The slot goes when nothing holds it; the store slot lives on and mints a
fresh slot into it on the next read or hold.

So the owner holds every root and every derivation the computed names, as
declared, with no transitive walk. A source
derivation whose only reader is another derivation is held because it is in that
reader's `sourceComputeds`, and the hold comes back when that reader is released.
The only things filed on a slot's `effects` list are effects, which the effect service
files through the slot's owner, so a source derivation that no effect names stays
filed because of that hold.

## Why a computed is pulled

A write marks a root slot — an entity, a bucket, a column — and wakes the
effects filed on it. It never visits a computed. An effect that names a computed
is filed on the computed and on every root underneath it: at construction the
effect walks its `sourceComputeds` down to their `sourceSlots`, collects each
root once, and subscribes to and holds each of them. So a write reaches the
effect directly, and the effect, before deciding to run, asks each computed it
names for its value — which settles that computed's own sources first, and so on
down.

What this buys:

- A computed nobody reads never derives. There is no dirty flag to propagate
  and no list of dependents to walk on a write; a write costs the same whether ten
  computeds sit over that root or none.
- At most one derive per clock tick. A settled computed remembers the clock
  reading it was checked at, and a second read at the same reading returns
  at once. Ten effects reading one computed in one frame, with no write between
  them, derive it once.
- No reader sees a half-updated graph. A computed settles its sources before
  it compares their stamps, so the order of evaluation is the order of the
  dependencies, decided by the reader's own recursion, not by a scheduler that has
  to sort the graph.

The cost is on the other side: an effect over a deep chain is filed on every root
under it, and asks the chain on every wake. A chain whose roots did not move
answers with stamp comparisons and no derive (below).

### What it asks before it derives

*Has anything I read moved?* Every source computed is settled on the way past, in
that order: a root answers "did I move" from a stamp it already carries and a
computed cannot, so a computed source is settled before its stamp is read.

A chain short-circuits. A recursive settle returns on that one question
when nothing under it moved, without deriving — so a chain over quiet roots is a
walk of integer comparisons, and a chain whose roots moved derives only the
levels whose inputs actually changed. That is what makes `filter → sort → page`
cost one comparison when an entity moves without leaving the filter, instead of
sorting everything again.

A cycle through `sourceComputeds` cannot be built: a computed's sources are
fixed by `createSources`, which runs before the slot exists, so the slot
cannot be among them. A read of the slot from inside its own `derive` answers the
previous `computedSlot.value` without deriving.

### `sameValueGuard` is what buys the short-circuit

`oimSameValueZeroGuard` is `===` with `NaN` equal to itself. Pass your own when the
derived value is a structure:

```ts
const idsService = createOIMComputedService<
    void, readonly string[], TOIMSingleSlotStore<TOIMComputedSlot<readonly string[], void>>
>({
    computedSlotStoreService: singleSlotStoreService<readonly string[]>(),
    sameValueGuard: (prev, next) => prev.length === next.length && prev.every((v, i) => v === next[i]),
    initialValue: [],
});
idsService.createComputedStoreSlot(
    db,
    () => [slot, other].flatMap((cardSlot) => (cardSlot.entity === undefined ? [] : [cardSlot.entity.id])),
    () => ({ sourceSlots: [slot, other] }),
);
```

`sameValueGuard` decides whether the readers of the computed are told: when it answers
`true`, the previous value is kept by identity and the slot does not count as
changed, so every reader above stops at its comparison. Left out, it is
`Object.is`. A body that throws leaves the computed exactly as it was and the next
read tries again.

## A computed as a source

A source computed is a slot taken from its own collection. Every source list in this
engine — `createEffect`'s `sourceComputeds` argument, `sourceComputeds` in
`createSources` — is typed `readonly TOIMComputedSlot[]`, so a typed slot goes in
as it is:

```ts
effectService.createEffect(db, [], [totalSlot], () => { use(totalSlot.computedValueService.getValueForSlot(totalSlot)); });

const doubledService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService: singleSlotStoreService<number>(),
});
const doubled = doubledService.createComputedStoreSlot(
    db,
    () => totalSlot.computedValueService.getValueForSlot(totalSlot) * 2,
    () => ({ sourceComputeds: [totalService.computedCollectionService.getSlotByKey(total, undefined)] }),
);
```

Inside `derive`, `computedSlot.value` is the previous value, which is what a
`sameValueGuard` compares the new one against.

## Both shapes are factories

The computed is the slot, and the slot dies when nothing holds it.
`OIMComputedService` and the store slots it creates are the **factories that own it**:
the value service holds the `sameValueGuard` once, a store slot holds
its derive function and its channel slot, both outlive every slot they mint, and when the previous slot is
gone the next read or hold mints a fresh one — by key in a keyed store slot, under the key `undefined` in a
single one.

A slot goes when nothing holds it, and a computed slot holds its sources while it
lives. A computed that lived as long as the object you created would hold its
sources for as long as you kept that object, and every entity it ever read would
stay in memory. So the long-lived things are the service and the store slot, which hold nothing, and
the computed is what they hand out: a slot that lives while something holds it or
an effect reads it, and gives its sources back when it goes.

What follows for a caller:

- Keep the store slot. A slot reference outlives the slot.
  `getValueForSlot`, `holdSlot` and `unholdSlot` on a released slot throw
  ("This identity was released"). Ask the collection again — `computedCollectionService.getSlotByKey(storeSlot, key)` /
  `holdSlotByKey(storeSlot, key)`, with the key `undefined` for a single — and it hands back the live slot,
  or mints a new one.
- `createSources` runs once per mint, and a store slot mints many times. A new slot
  names its sources afresh and takes fresh holds on them.
- A new slot starts from `initialValue` and derives on its first read; the
  value of a slot that went is not carried over.

## Releasing a computed and its sources

A computed slot goes when its holds are back, no effect is on it, and its release
policy agrees. Going gives back the hold it took on each
of its sources, and each source's owner may then let that source go, one level
at a time.

The default for a computed is `OIMSlotReleasePolicyAtUnhold.INSTANCE`, used by every computed factory when
no `slotReleasePolicy` is passed; the computed factories take no db, so the `OIMDB`'s policy does not
reach a computed. The entity collections' default is `OIMSlotReleasePolicyAtEmpty`.
A computed slot is never empty — its emptiness check answers `false` — so
`OIMSlotReleasePolicyAtEmpty` and `OIMSlotReleasePolicyNever` keep it, and every
source under it, for the life of the store slot. Without a time policy a computed
slot goes at its last unhold or effect detach, or at the next flush when it was
only read. The policies are listed in
[Slot lifecycle](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).

```ts
const pinnedTotalService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService: singleSlotStoreService<number>(),
    slotReleasePolicy: OIMSlotReleasePolicyNever.INSTANCE,
});
const pinnedTotal = pinnedTotalService.createComputedStoreSlot(
    db,
    () => (slot.entity?.rank ?? 0) + (other.entity?.rank ?? 0),
    () => ({ sourceSlots: [slot, other] }),
);
const pinnedTotalSlot = pinnedTotalService.computedCollectionService.getSlotByKey(pinnedTotal, undefined);
pinnedTotalSlot.computedValueService.getValueForSlot(pinnedTotalSlot);
```

Use `OIMSlotReleasePolicyNever` for a computed that every screen reads and that is cheap to keep;
leave the default for one that belongs to a view that comes and goes. The policy
belongs to the collection type, so every store slot of that service shares it. The options
of the policies that take a window are in
[Releasing an identity on a clock](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).
`createOIMComputedServiceSorted` and `createOIMComputedServiceBucketMemo` take a `slotReleasePolicy` too.

## Effects

`OIMEffectService.INSTANCE.createEffect` and `createEffectImmediate` are how an effect is built, and
subscribing is one of the [four minting doors](/docs/core/model#the-four-doors).
`createEffect` alone never runs its body at creation; `createEffectImmediate` runs it once
immediately and, if that run throws, disposes the effect and rethrows. An effect created
while the open frame already has writes is scheduled for
that frame's flush, but it does not receive writes made before it was created. The
effect service is stateless — there is one, `OIMEffectService.INSTANCE` — and each door takes the channel
map (`db`) first; an effect is a plain `TOIMEffect` object with no methods. When all you keep is the way to
stop it, `effectService.subscribeEffect(db, roots, computeds, body)` builds the same effect and returns
its `TOIMDisposer`.

```ts
const effect = effectService.createEffect(
    db,
    [slot, other],            // root slots
    [totalSlot],              // derivations
    () => { render(); },
);

effectService.disposeEffect(effect);
```

An effect holds every slot it is filed on — the roots you name, the roots under
the derivations you name, and the derivations themselves — so nothing it reads goes
while it stands, whatever the release policy. Use an effect for what leaves the
graph (a render, a network call, a log); a value another part of the graph reads
belongs in a computed, because an effect's result has no slot anyone can name as a
source.

The body runs when something it reads has moved. An effect counts as having run
only after its body returns, so a body that threw takes the same change again at
its next wake. `disposeEffect` takes the effect off every root's
dependent list and asks each root's owner whether it may go, which may empty the
dependent list of a derivation below it, and so on down. That is where a chain
comes apart, one level at a time, driven by the same call.

An effect has no `dispose` of its own; a detached disposer is `() => effectService.disposeEffect(effect)`,
or the one `subscribeEffect` hands back — see [giving handles back](/docs/core/reading-subscribing#giving-many-handles-back-at-once).

Two things about how an effect is filed:

- The derivation list is deduplicated. Naming one computed slot twice in the
  `sourceComputeds` argument gets it one edge, so unfiling the effect later cannot
  disturb a different subscriber.
- `disposeEffect` unfiles by a remembered position rather than by scanning. Each
  effect records where it sits in every list it is on, and a removal moves the
  last effect of the list into the vacated place. That
  keeps taking N subscribers off one identity linear in N. The slot's owner is the only writer of the
  `effects` list, and does so when the effect service asks it to subscribe or
  unsubscribe. The consequence you can observe: a slot's `effects` is not in
  subscription order.

The body's type is `TOIMEffectBody` — `() => (() => void) | void`. Return a
function and it is run before the next run of the body and by `disposeEffect`, so a body
that opened something per run has somewhere to close it. See
[a body may hand back its own undo](/docs/core/reading-subscribing#a-body-may-hand-back-its-own-undo).

### An effect over one column

```ts
effectService.createEffect(db, [cardService.holdColumn(slot, 'rank')], [], () => { render(); });
```

It takes the column slot and a body, and wakes only when that column moves. See
[Reading and subscribing](/docs/core/reading-subscribing#subscribing-to-one-column).

### An effect that finds its sources as it reads

`createEffect` takes its sources up front. `createEffectWithSourceTracking(db, body)` takes
none: the body receives an `OIMEffectSourceTracker`, and every slot or derivation it reads
through the tracker becomes a source of that run. This is how a signal library tracks
dependencies, and it fits a body whose reads depend on the data — a branch, a lookup
that names a different slot next time.

```ts
const showTotal = cardService.getSlotByKey(cards, 'settings');
effectService.createEffectWithSourceTracking(db, effectSourceTracker => {
    const isTotalShown = effectSourceTracker.readSourceSlot(showTotal).entity?.rank === 1;
    render(isTotalShown
        ? effectSourceTracker.readSourceComputedValue(totalSlot)
        : effectSourceTracker.readSourceSlot(slot).entity?.title);
});
```

- `readSourceSlot(slot)` files the slot as a source and hands it back, so the body reads
  `slot.entity` as usual. `readSourceComputedValue(computedSlot)` files the derivation and
  returns its value.
- The body runs once at creation, because the first run is what finds the sources.
- After each run the effect is subscribed to exactly what that run read. A branch the run
  did not take is unsubscribed, and a slot read twice is subscribed once.
- A run that reads the same sources in the same order as the run before compares each
  read with the previous one and changes no subscription.
- `createEffect` is unchanged. The two are picked per effect, at creation: declared sources
  where the dependencies are known, tracked sources where they move with the data.
- The body's type is `TOIMEffectBodyWithSourceTracking`
  — `(effectSourceTracker: OIMEffectSourceTracker) => (() => void) | void`; a returned
  function is the undo, as for `createEffect`.

## One derivation, no key

```ts setup
const topRankService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService: singleSlotStoreService<number>(),
    sameValueGuard: oimSameValueZeroGuard,
    initialValue: -1,
});
const topRank = topRankService.createComputedStoreSlot(
    db,
    () => cardService.getSlotByKey(cards, 'c1').entity?.rank ?? -1,
    () => ({ sourceSlots: [cardService.getSlotByKey(cards, 'c1')] }),
);
```

```ts
const heldTopRank = topRankService.computedCollectionService.holdSlotByKey(topRank, undefined);   // minted once; the same slot while anything holds it
heldTopRank.owner.unholdSlot(heldTopRank);                              // gone; the next holdSlotByKey(topRank, undefined) mints a new one
```

`createOIMComputedService<void, TValue, TOIMSingleSlotStore<TOIMComputedSlot<TValue, void>>>({ computedSlotStoreService, sameValueGuard?, initialValue?, slotReleasePolicy?, derive?, createSources? })`
builds an `OIMComputedService` keyed by `void`. On a `void` key the `computedSlotStoreService` is required,
and `OIMSlotStoreServiceSingleSlotDriven.INSTANCE` is the store service that files at most one slot; its
store is `TOIMSingleSlotStore` — `{ slot }`, `undefined` while no slot is minted.
`createComputedStoreSlot(db, derive?, createSources?)` creates one single computed in it and mints
nothing; a `derive` or `createSources` given to the store slot is used in place of the
service's, and each must come from one of the two.
`sameValueGuard` defaults to `Object.is`. A single has no doors of its own: it is read through the
collection doors of `computedCollectionService` with the key `undefined` —
`getSlotByKey(storeSlot, undefined)` (a slot without a hold, so a fresh one is let go at the next flush
unless something holds it), `holdSlotByKey(storeSlot, undefined)` and `findSlotByKey(storeSlot, undefined)`,
which mints nothing. A slot's give-back is `slot.owner.unholdSlot(slot)`, and its value
is `slot.computedValueService.getValueForSlot(slot)`. The slot is minted on the first get or hold
and released at its release policy, as in a collection, and the next get or hold mints a fresh one.

`createSources` is handed the key `undefined` here: the store slot has at most one live slot, so
there is nothing for it to be told.

## One derivation per key

```ts setup
const rankByIdService = createOIMComputedService<TOIMStoreKey, number>({
    sameValueGuard: oimSameValueZeroGuard,
    initialValue: -1,
});
const ranks = rankByIdService.createComputedStoreSlot(
    db,
    (computedSlot) => cardService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
    (id) => ({ sourceSlots: [cardService.getSlotByKey(cards, id)] }),
);
const rankCollectionService = rankByIdService.computedCollectionService;
```

`createOIMComputedService(options)` takes no db. On a keyed service every option is
optional: `derive` and `createSources` (the defaults for every store slot that is given
none), `computedSlotStoreService` (the store the derivation slots are filed in; a Map store when left out,
and required for any other store), `sameValueGuard` (default `Object.is`),
`initialValue`, `slotReleasePolicy` and `columnSlotStoreService` or
`columnNames` (left out, `OIMDefaults.COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue()`); left out, a
derivation goes at its last unhold (`OIMSlotReleasePolicyAtUnhold`). `createComputedStoreSlot(db, derive?, createSources?)`
refuses by name when neither it nor the service has a `derive` and a `createSources`.
A last unhold that lands while the channel is
flushing does not release on the spot: the derivation is handed to the db's
unused-slot collector and released when the flush ends, as every non-empty slot is.

`createSources` takes the key, and declares the sources of the
slot it is minting, as a `TOIMComputedSources` — `{ sourceSlots, sourceComputeds }`. It does not hold them
itself. The owner takes a hold on every slot in `sourceSlots` and every entry in
`sourceComputeds` the moment it creates the slot, and gives exactly those
back when it releases the slot — so a source stands for as long as the derivation
is filed and never passes through zero references.

That is why `createSources` resolves through `getSlotByKey` and not `holdSlotByKey`: a hold
it took for itself is one nobody gives back. `getSlotByKey`
hands its mint to the unused-slot collector, which lets go at the next flush, by
which time the owner's own hold is standing.

`derive` receives the computed slot, so it reads `computedSlot.key` to know which
key it is deriving — one function serves every key.

The computed collection service files a keyed store slot's derivations the way the entity and bucket
collections file theirs, so it has the same keyed doors, each taking the store slot first:

```ts
const heldRank = rankCollectionService.holdSlotByKey(ranks, 'c1');  // built once; the same object while anything holds it
rankCollectionService.getSlotByKey(ranks, 'c9');                    // the derivation, built if 'c9' had none; the collector tracks the mint
rankCollectionService.getSlotCount(ranks);
for (const derivation of rankCollectionService.getSlots(ranks)) { use(derivation.computedValueService.getValueForSlot(derivation)); }
heldRank.computedValueService.getValueForSlot(heldRank);            // settles, then answers
heldRank.owner.unholdSlot(heldRank);                                // the give-back; there is no release call on a derivation
```

A derivation is never empty, so what decides when one may go is the hold count,
the effects on it, and the release policy.

## Computed columns

A computed's value can be subscribed to by field. `getColumn(slot, columnName)`,
`holdColumn(slot, columnName)`, `getColumnGroup(names)`,
`holdColumnGroup(slot, group)`, `unholdColumn(columnSlot)` and the any-column
pair `getAnyColumn(slot)` / `holdAnyColumn(slot)` are on `computedCollectionService`
(so on the sorted and memo services too); for a single computed, the slot is the one
`getSlotByKey(storeSlot, undefined)` hands out. Column names are typed as the keys of the value.

A computed's column owner is the derive-driven strategy: each column slot is a computed slot over the
carrier computed, its value `carrier.value[column]` (a tuple of the group's fields, ordered by the sorted column names, for a group, the whole
value for the any-column slot), compared with `Object.is`. It is a `TOIMComputedColumnSlot`
(`TOIMComputedSlot<unknown, string>`), so it goes in the `sourceComputeds` list of `createEffect`, and it
wakes an effect only when that field of the derived value changes. Entity and bucket columns, keyed or
single, are the write-driven strategy: plain column slots woken by the marks a write makes, and they go in
the root list.

```ts
type CardSummary = { top: number; count: number };
const cardSummaryService = createOIMComputedService<void, CardSummary, TOIMSingleSlotStore<TOIMComputedSlot<CardSummary, void>>>({
    computedSlotStoreService: singleSlotStoreService<CardSummary>(),
});
const cardSummary = cardSummaryService.createComputedStoreSlot(
    db,
    () => ({ top: Math.max(slot.entity?.rank ?? 0, other.entity?.rank ?? 0), count: cardService.getSlotCount(cards) }),
    () => ({ sourceSlots: [slot, other] }),
);
const cardSummaryCollectionService = cardSummaryService.computedCollectionService;
const topColumn = cardSummaryCollectionService.holdColumn(cardSummaryCollectionService.getSlotByKey(cardSummary, undefined), 'top');
const onTop = effectService.createEffect(db, [], [topColumn], () => { render(topColumn.value); });
effectService.disposeEffect(onTop);
cardSummaryCollectionService.unholdColumn(topColumn);
```

## The order of a bucket is a derivation

A bucket never sorts: its order is the one the caller wrote. Two derivations
read it, and both are subscribed to rather than the bucket.

The bucket's own order, as an array: `createOIMComputedServiceBucketMemo`. Take it
over an array-driven bucket collection whose order the caller writes (a playlist, a
hand-arranged board) when the consumer wants an array:

```ts setup
const byDeckService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const byDeck = byDeckService.createStoreSlot(db);
```

```ts
const orderService = createOIMComputedServiceBucketMemo({
    bucketCollectionService: byDeckService,
});
const order = orderService.createBucketMemoStoreSlot(byDeck);
const deck = orderService.computedCollectionService.holdSlotByKey(order, 'spades');       // mints and holds the bucket too
effectService.createEffectImmediate(db, [], [deck], () => render(deck.computedValueService.getValueForSlot(deck)));
```

`createOIMComputedServiceBucketMemo(options)` takes no db: a memo store slot runs on the channel slot of
the bucket store slot it reads. The options object has one required key, `bucketCollectionService`, the
bucket collection the orders read; `createBucketMemoStoreSlot(bucketStoreSlot)` then names the bucket store
slot of that collection whose buckets it orders. `computedSlotStoreService` (the store the orders are filed
in; a Map store when left out), `slotReleasePolicy` and `columnSlotStoreService` are optional.

Its value is that bucket's slots in the bucket's order, produced on the
read that asks for it and never while nothing reads it. It counts as changed
only when the list a reader would see actually changed. The array comes back
by identity — the same one for as long as the list holds — so a consumer memoising
on identity needs no comparison of its own. Its source list is one slot, the
bucket, and it never grows.

A sorted list over an index: `createOIMComputedServiceSorted`.

```ts
const everyCardService = createOIMIndexService(db, { entityService: cardService, keyOf: () => 'all' });
const everyCard = everyCardService.createIndexStoreSlot(cards);
const byRankService = createOIMComputedServiceSorted({
    indexService: everyCardService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const byRank = byRankService.createSortedStoreSlot(everyCard);
const ranked = byRankService.computedCollectionService.holdSlotByKey(byRank, 'all');
effectService.createEffectImmediate(db, [], [ranked], () => render(ranked.computedValueService.getValueForSlot(ranked)));
```

`indexService` is the `OIMIndexService` the sorted list reads, and `createSortedStoreSlot(indexStoreSlot)`
names which of its index store slots. `sortColumns` (`TOIMSortColumn<TEntity>[]`) decide which writes re-sort;
`comparator: (left, right) => number` decides the order, and without it the order is
`oimColumnsComparator(sortColumns)`. Its sources are the bucket slot of the key plus one
bucket column slot per column, so it re-sorts only when membership changes or a write
changes one of those columns on a member. Given only a `comparator`, its sources are the
bucket slot and the bucket's any-column slot, and any member write re-sorts. A re-sort that yields the same
sequence keeps the previous array. See [Ordering](/docs/core/oimindex#ordering).

`sortColumns` says when to sort and `comparator` says how. A comparator is a function the engine cannot look inside, so on its
own it cannot tell which writes could change the order and has to re-sort on every
member write. Naming the columns lets the engine subscribe to exactly those columns;
the comparator, when given as well, still decides the order.

| Given | Sources | Re-sorts on | Order |
|---|---|---|---|
| `sortColumns` | bucket slot + one bucket column slot per column | membership, a write to a named column on a member | `oimColumnsComparator(sortColumns)` |
| `sortColumns` + `comparator` | the same | the same | `comparator` |
| `comparator` | bucket slot + the bucket's any-column slot | membership, any member write | `comparator` |
| neither | bucket slot | membership | a member keeps its place; an arrival is appended |

On a membership change the previous order is kept for the members that stayed and
the arrivals are appended before the sort runs; with no membership change the
previous array is copied and sorted again. An entity slot whose entity is gone sorts
last. Its slots are filed in a Map store unless the factory is given a `computedSlotStoreService`.

## The two kinds of node

A value is a computed slot. A side effect is an effect created with
`effectService.createEffect`, over a column slot when it watches one field of one
slot. Derivations such as `createOIMComputedServiceBucketMemo` are settled by the read
that asks, so there is nothing to settle early.

## Where to next

<DocCards>
<DocCard to="/docs/core/channel" title="The channel: frames and subframes">The frame rules in full.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Slot lists whose slots the caller states.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">Buckets filled from a source collection by a key function.</DocCard>
</DocCards>
