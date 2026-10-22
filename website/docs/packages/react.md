---
sidebar_position: 2
description: How to provide the database to React and which hook to call for an entity, one field, a bucket's slots or a derivation, starting from useOIMValue.
---

# React

`@oimdb/react` binds `@oimdb/core` to React. The whole binding is one hook,
`useOIMValue`, plus wrappers built on the same mechanism. There is one wrapper
per core participant: an entity or field, a bucket, a computed slot or a key of a
computed store slot, and a computed store slot the component owns. Another hook holds
slots for a component without subscribing to them, and the provider hands every hook the database.

<InShort>

- The whole binding is one hook, `useOIMValue`, plus wrappers built on the same mechanism.
- A subscription is an effect from the core's stateless `OIMEffectService.INSTANCE`, and the value is read off the slots.
- The provider hands the hooks the `OIMDB`, and nothing else.
- There is a wrapper for each core participant: entity, field, bucket and computed.
- A hook that reads a collection takes the collection service first and the store slot second.

</InShort>

Not yet published. See [Installation](../getting-started/installation.md).

There is no observable wrapper. A subscription is an effect,
`OIMEffectService.INSTANCE.subscribeEffect(db, sourceSlots, sourceComputeds, body)`, and the value is read
off the slots afterwards.

## Minimal usage

```tsx file=minimal.tsx
import { OIMDB, createOIMEntityService } from '@oimdb/core';
import { OIMDBProvider, useOIMEntity } from '@oimdb/react';

type Card = { id: string; title: string };

const db = new OIMDB();
const cardService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
const cards = cardService.createStoreSlot(db);

function CardTitle({ cardId }: { cardId: string }) {
  const card = useOIMEntity(cardService, cards, cardId);
  return <h1>{card?.title}</h1>;
}

export function App() {
  return (
    <OIMDBProvider db={db}>
      <CardTitle cardId="c1" />
    </OIMDBProvider>
  );
}

cardService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'First' });
db.flush();
```

`CardTitle` renders nothing until the upsert; `db.flush()` ends the frame, and the
component re-renders with the new entity. The services are built once per type and hold
no data; `cards`, the store slot, is the one instance they read and write.

## Which hook to take

| You have | You want | Take |
|---|---|---|
| an entity collection service, its store slot and a key | the entity, re-rendered when it is written | `useOIMEntity(entityCollectionService, entityStoreSlot, key)` |
| an entity slot | one column of it, re-rendered only when that column is written | `useOIMField(entityCollectionService, slot, name)` |
| a bucket somebody else resolved and holds | its member slots as an array | `useOIMBucketSlots(bucketCollectionService, bucketSlot)` |
| a bucket collection (or index) service, its store slot and a key | that bucket, owned by the component | `useOIMBucketSlotsByKey(bucketCollectionService, bucketStoreSlot, key)` |
| a collection service (computed, entity, bucket or index), its store slot and keys | the slots held while mounted, with no re-render | `useOIMSlotsByKeys(slotCollectionService, storeSlot, keys)` |
| one computed slot | its value, re-rendered when it changes | `useOIMComputedValue(computedSlot)` |
| a computed collection service, its store slot and a key | that key's value, owned by the component | `useOIMComputedValueByKey(computedService.computedCollectionService, computedStoreSlot, key)` |
| a module-scope computed service and a derive | a keyed computed store slot the component owns, rebuilt when `deps` change | `useOIMComputedCollection(computedService, derive, createSources, deps)` |
| a module-scope void-keyed computed service and a derive | the value of a single computed the component owns | `useOIMSingleComputedValue(computedService, derive, createSources, deps)` |
| a single entity service and its store slot | its entity, re-rendered when it is written | `useOIMSingleEntity(singleSlotService, singleSlotStoreSlot)` |
| a single bucket service and its store slot | its member slots as an array | `useOIMSingleBucketSlots(singleSlotService, singleSlotStoreSlot)` |
| any slots and derivations | any value read off them | `useOIMValue(binding)` |
| nothing | the `OIMDB` the provider was given | `useOIMDB()` |

Every hook that reads a collection takes the collection service, typed as a `Pick` of
`OIMSlotCollectionService` with only the members it calls, and then the store slot.
`useOIMBucketSlotsByKey` resolves through `holdSlotByKey(bucketStoreSlot, key)` and reads members through
`bucketCollectionService.slotContentService.getBucketMemberSlots(bucketSlot)`, so an index service and its index
store slot fit it as well as a bucket collection. The hold is given back through the slot's own owner,
`slot.owner.unholdSlot(slot)`. `useOIMBucketSlots` takes a bucket collection service and a bucket somebody else holds.

## Why one binding is enough

Every hook here is built on one primitive, `useOIMValue`, because the core has one
way to subscribe: `subscribeEffect(db, sourceSlots, sourceComputeds, body)`.
The other hooks write the `useMemo` for common shapes. A binding has three parts:
the roots a write can reach, the derivations to ask before reading, and the derive
function.

```typescript signature
export type TOIMBinding<TValue> = {
    readonly sourceSlots?: readonly TOIMSlot[] | undefined;
    readonly sourceComputeds?: readonly TOIMComputedSlot[] | undefined;
    readonly derive: () => TValue;
};
```

- `sourceSlots` and `sourceComputeds` are both optional and default to none. They are handed to the effect as they are.
  The effect holds every root and every derivation it is built over for as long as
  it lives: the effect service calls `slot.owner.subscribeToSlot` on each, and the disposer
  gives each back through `slot.owner.unholdSlot`. So everything a binding subscribes to
  stays filed while the component is subscribed, and a binding has nothing else to hold.
  A slot you read but do not want to wake on is kept alive outside the binding, with
  `useOIMSlotsByKeys` or a hold your module owns.
- `derive` is called on every render, after the derivations are settled.

Every `unholdSlot` ends in the owner's `releaseSlotIfUnheld`, so tearing a
subscription down asks the identity's owner whether it may go. For an
identity nothing else holds at that instant, the release policy answers.
That is why a slot your code resolved and still uses has to be held by your code,
not by the component that happens to subscribe to it.

The snapshot `useSyncExternalStore` compares is a local counter, not the value,
because the value's reference may not change. An in-place writer
(`createOIMEntityWriterInPlace`) keeps the entity object, a bucket returns the same
live container, and a column effect fires without the entity changing.

The counter is also bumped on subscribing, before the effect is built.
React's post-commit check compares the version captured at render against a fresh
one, and a counter that only the notification bumps makes that comparison `0` against
`0`, so anything that moved between the render and the subscription would never
be shown. `subscribe` runs in a passive effect, so a sibling's
`useLayoutEffect` that writes and flushes can land in that window. The window cannot
be inspected instead: the component holds nothing yet, and a write to a slot nothing
holds leaves no trace on the channel. The price is one extra render per subscription
commit (per mount, and per change of the memo key), not one per render or per notification.

## Setup

The examples below share these definitions.

```tsx setup
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  OIMDB, OIMSlotStoreServiceSingleSlotDriven,
  createOIMBucketService, createOIMComputedService, createOIMComputedServiceSorted,
  createOIMEntityService, createOIMIndexService, createOIMSingleBucketService, createOIMSingleEntityService,
  oimSameValueZeroGuard,
} from '@oimdb/core';
import type {
  TOIMBucketSlotsArrayStore, TOIMBucketSlot, TOIMComputedSlot, TOIMEntitySlot, TOIMSingleSlotStore,
} from '@oimdb/core';
import {
  OIMDBProvider, useOIMBucketSlots, useOIMBucketSlotsByKey, useOIMDB, useOIMEntity,
  useOIMComputedCollection, useOIMComputedValue, useOIMComputedValueByKey, useOIMField,
  useOIMSingleBucketSlots, useOIMSingleComputedValue, useOIMSingleEntity, useOIMSlotsByKeys, useOIMValue,
} from '@oimdb/react';

type Card = { id: string; title: string; deckId: string; rank: number };
type User = { id: string; avatarUrl: string };

const db = new OIMDB();
const cardService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
const cards = cardService.createStoreSlot(db);
const userService = createOIMEntityService<User>(db, { keyOf: user => user.id });
const users = userService.createStoreSlot(db);
const byDeckService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const byDeck = byDeckService.createStoreSlot(db);
const deckIndexService = createOIMIndexService(db, {
  entityService: cardService,
  keyOf: (card: Card) => card.deckId,
});
const deckIndex = deckIndexService.createIndexStoreSlot(cards);
const byRankService = createOIMComputedServiceSorted({
  indexService: deckIndexService,
  sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const byRank = byRankService.createSortedStoreSlot(deckIndex);
```

## `OIMDBProvider` and its context

```tsx
function App({ children }: { children: ReactNode }) {
  return <OIMDBProvider db={db}>{children}</OIMDBProvider>;
}
```

`OIMDBProvider` puts one value in context: the `OIMDB` (`OIMDBContext`, read with `useOIMDB()`). The effect
service is stateless (`OIMEffectService.INSTANCE`) and takes the database as its channel map, so there is
nothing else to provide. You pass collection services and their store slots to each hook as arguments, and you
keep them in a module.

A slot filed on another `OIMDB` than the provider's would never wake the component, and the screen would stay as
first painted with no sign why. So the hooks that resolve or take a slot check that its store slot runs on
`db.defaultChannelSlot`, and throw, naming the hook, when it does not. `useOIMSlotsByKeys` needs no provider: it
takes no subscription and never reads the context.

The context is exported, for tests or for wiring a provider by hand. Its default value is `undefined`, which is
why `useOIMDB` throws outside a provider.

## `useOIMValue` — the primitive

```tsx
function DeckSize({ bucket }: { bucket: TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<Card>>> }) {
  const deckCards = useOIMValue(useMemo(() => ({
    sourceSlots: [bucket],
    derive: () => Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket)),
  }), [bucket]));
  return <span>{deckCards.length}</span>;
}
```

**What for:** anything the wrappers do not cover, such as a value over several roots, a
derivation, an index bucket or a count. **When not:** a single entity, column or
bucket. The wrappers below already write the memo.

It subscribes one effect over `binding.sourceSlots` and `binding.sourceComputeds` per subscription, and the
effect body only bumps the counter and tells React. The notification never carries the value; `derive`
produces it during the render.

It settles the binding's derivations before every read, by calling
`slot.computedValueService.getValueForSlot(slot)` on each entry of `sourceComputeds`, because a
derivation is asked and never woken: nothing in a frame walks to a computed slot,
so a `derive` that reaches a derivation's result any way other than `getValueForSlot`
would show whatever the last produce left there.

### The binding must keep its identity across renders

This is required. Getting it wrong does not cost you an allocation; it hangs the
screen.

```tsx
function BrokenDeckSize({ bucket }: { bucket: TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<Card>>> }) {
  // DO NOT. A new binding every render, and this never stops rendering.
  const slots = useOIMValue({ sourceSlots: [bucket],
                              derive: () => Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket)) });
  return <span>{slots.length}</span>;
}
```

A fresh binding misses the hook's memo on every render. That gives `subscribe` a
new identity, and React resubscribes on every commit. The counter
bump then makes React's post-commit check differ (every fresh store starts at
`0` and every fresh `subscribe` takes it to `1`), so React forces another render,
which builds another binding. Nothing converges. React logs
`Maximum update depth exceeded`, which is a `console.error` and not a throw, so
the symptom is a frozen screen and a growing console, not an error you can
catch. React cannot notice, because the snapshot is a counter and not a value.

Writing that `useMemo` once, so no call site has to, is the whole job of
`useOIMField` and `useOIMBucketSlots`.

## `useOIMEntity` — one entity, by key

```tsx
function CardTitle({ cardId }: { cardId: string }) {
  const card = useOIMEntity(cardService, cards, cardId);
  return <h1>{card?.title}</h1>;
}
```

**What for:** a component addressed by a primary key, such as a route param or a prop from
a list. It returns `TEntity | undefined`: `undefined` until something writes the
key, and it re-renders when the entity slot is written. **When not:** the
component renders one column of an entity it already has a slot for. Take
`useOIMField`, which does not re-render on writes to other columns.

The key is resolved when the subscription commits, never during a render.
`holdSlotByKey(entityStoreSlot, key)` is a minting door: it files the identity and takes a
counted reference. A render is not a lifetime, because React is free to throw one
away, and an identity minted by a render that never committed would have no
hold that anybody gives back.

The render path reads `getSlotByKey(entityStoreSlot, key).entity`, so first paint is
current state with nothing to wait for. That read mints when the key has none, but
the mint goes to the unused-slot collector instead of to a counted reference, so
a render that never commits leaves nothing standing past the next `flush()`.

Inside `subscribe` the hook resolves with `holdSlotByKey`, builds the effect over
that slot, and gives its own hold back in a `finally` straight after. From then on
the effect's hold is what keeps the identity, so the slot is counted once, and
disposing the effect on unmount or on a key change gives that one count back. The
resolve repeats on every subscribe, so StrictMode's mount–unmount–mount never
leaves the second mount on an identity the first unmount let go. A key that names
the same identity as the one before is kept, as for
[`useOIMBucketSlotsByKey`](#the-key-may-be-built-inline). The by-key hooks (`useOIMEntity`, `useOIMBucketSlotsByKey`, `useOIMComputedValueByKey` and, through it, `useOIMSingleComputedValue`) share one body.

## `useOIMField` — one field of one identity

```tsx
function AvatarBadge({ user }: { user: TOIMEntitySlot<User> }) {
  const avatarUrl = useOIMField(userService, user, 'avatarUrl');
  return <img src={avatarUrl} />;
}
```

**What for:** a component that shows one column of a wide entity, where a write
to the other columns should not re-render it. **When not:** the component reads
several columns. One `useOIMEntity` is one subscription, and several `useOIMField`
calls are several.

The entity collection service is the first argument, because the collection mints and files a column
identity through its own column owner; the entity slot does not. Hand over anything with
`getColumn(slot, columnName)`.

`name` is a column of that slot's entity, so a typo is a compile error and the
value comes back with the type that column holds, or `undefined`. The value is read
off `slot.entity` on every render, and the subscription only decides when to render.
The subscription is an effect over the column slot. A write
that names other columns marks only the column slots it names, so it does not reach this one.

It does not go through `useOIMValue`, and it cannot: the column is resolved by
`getColumn(slot, columnName)` inside the subscription, so the slot the effect is built over does not exist when
a binding would be memoised, and there is no root slot a binding could name.

The hook holds the entity slot for itself. The effect counts the
column, not the slot that carries it, and when the column is released its owner
asks the carrier's owner whether the carrier may go too
(`carrierSlot.owner.releaseSlotIfUnheld`). So the entity slot is held before the
effect is built and given back in a `finally` after the dispose.

It takes a `TOIMEntitySlot` because that is what can be taken out from under the
component. The slot of a single entity is read through `getSingleSlot(storeSlot)`, which mints a
fresh slot when the old one was released, so a slot captured once may stop being the one the
store slot carries. Pass `settingsService.getSingleSlot(settings)` to `useOIMField` at each render.

## `useOIMBucketSlots` — a bucket's contents, as an array

```tsx
function DeckList({ bucket }: { bucket: TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<Card>>> }) {
  const deckCards = useOIMBucketSlots(byDeckService, bucket);
  return (
    <ul>
      {deckCards.map((slot) => (
        <li key={String(slot.key)}>{slot.entity?.title}</li>
      ))}
    </ul>
  );
}
```

**What for:** a list whose bucket is resolved and held outside the component, such as in a
store module or a parent. **When not:** the component itself decides which bucket
by key. Take `useOIMBucketSlotsByKey`, which owns the lifetime.

The collection service is the first argument because reading a bucket is its content service's question: the
order the slots come back in lives in the bucket content service, and the bucket does not carry one.

It is `useOIMValue` over `sourceSlots: [bucket]`, with no `sourceComputeds`. It
takes a bucket somebody else resolved and holds nothing of its own. While mounted, the effect's hold keeps the
bucket filed, and on unmount that hold goes back. Whoever resolved the bucket with
`holdSlotByKey(bucketStoreSlot, key)` gives that count back with
`bucket.owner.unholdSlot(bucket)`, which this hook never calls. Resolve in a
module, keep the hold for as long as the slot is in use, and pass the slot down.

The content service hands back a live container. The hook copies it into a readonly array because a
React list needs something to map over, and a live container is the same
reference on every render regardless of content. The copy is taken only when the bucket
slot's change stamp (`changedAtRevision`, `changedAtEpoch`) moved, so a render the bucket
did not cause, such as a parent's, gets the same array back and a `memo` child below
skips. The stamp is reliable here because the caller holds the bucket, and a slot
nothing holds is never stamped. `useOIMBucketSlotsByKey` reads a bucket nobody may hold before the subscription,
so it copies on every render.

## `useOIMBucketSlotsByKey` — one bucket, by key

```tsx
function Deck({ deckId }: { deckId: string }) {
  const deckCards = useOIMBucketSlotsByKey(byDeckService, byDeck, deckId);
  return <ul>{deckCards.map((slot) => <li key={String(slot.key)}>{slot.entity?.title}</li>)}</ul>;
}

function IndexedDeck({ deckId }: { deckId: string }) {
  const deckCards = useOIMBucketSlotsByKey(deckIndexService, deckIndex, deckId);
  return <ul>{deckCards.map((slot) => <li key={String(slot.key)}>{slot.entity?.title}</li>)}</ul>;
}
```

It takes a bucket collection service and its store slot; an index service and its index store slot fit too.

**What for:** a bucket chosen by a prop, such as a search box, a route param or a
virtualised cell. The component owns the bucket's lifetime, and nobody else has to.

Like `useOIMEntity`, it resolves with `holdSlotByKey(bucketStoreSlot, key)` when the
subscription commits and never during a render, builds the effect over the
bucket, and gives the resolve-hold straight back once the effect exists. The
effect's hold is then the component's one count on the bucket while mounted, and
disposing the effect on unmount and on every key change gives it back. No
teardown of yours is involved.

It re-resolves on every subscribe. StrictMode mounts, unmounts and mounts
again. The unmount's give-back can drop an empty bucket out of its store slot, and
a captured bucket would leave the second mount subscribed to one nothing files.
The render path reads `getSlotByKey(bucketStoreSlot, key)`, whose mint goes to the
unused-slot collector, so first paint is the current list.

### The key may be built inline

Including the array a tree-driven bucket store is keyed by. This setup adds a
composite-keyed bucket collection to the definitions above:

```tsx setup
import {
  OIMKeyTreeWalkComposite, OIMSlotContentBucketServiceSetDriven, OIMSlotStoreServiceTreeDriven,
} from '@oimdb/core';
import type { TOIMBucketSlotsSetStore, TOIMSlotStoreTree } from '@oimdb/core';

type Deck = { id: string };
type Day = { id: string };
type TDeckAndDayBucketSlot = TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<Card>>, readonly TOIMEntitySlot[]>;

const deckService = createOIMEntityService<Deck>(db, { keyOf: deck => deck.id });
const decks = deckService.createStoreSlot(db);
const dayService = createOIMEntityService<Day>(db, { keyOf: day => day.id });
const days = dayService.createStoreSlot(db);
const byDeckAndDayService = createOIMBucketService<
  TOIMEntitySlot<Card>, readonly TOIMEntitySlot[], TOIMBucketSlotsSetStore<TOIMEntitySlot<Card>>,
  OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>,
  TOIMSlotStoreTree<TDeckAndDayBucketSlot, TOIMEntitySlot>
>(db, {
  slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>(),
  bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TDeckAndDayBucketSlot>(
    new OIMKeyTreeWalkComposite(),
  ),
});
const byDeckAndDay = byDeckAndDayService.createStoreSlot(db);
```

```tsx
function Slot({ deckId, day }: { deckId: string; day: string }) {
  const slotCards = useOIMBucketSlotsByKey(byDeckAndDayService, byDeckAndDay, [
    deckService.getSlotByKey(decks, deckId), dayService.getSlotByKey(days, day),
  ]);
  return <ul>{slotCards.map((s) => <li key={String(s.key)}>{s.entity?.title}</li>)}</ul>;
}
```

No spelling of that array keeps its identity across renders, so the
hook settles the key by meaning before its memo sees it. It asks the collection
which identity each key names, because the store is what files them and two keys
that resolve to one bucket are one key.

This costs one `===` on every render that did not change the key (every
scalar and every memoised array), and two lookups on a render that did.

## `useOIMComputedValue` — one computed value

```tsx
const spadesInOrder = byRankService.computedCollectionService.holdSlotByKey(byRank, 'spades');

function SpadesInOrder() {
  const ranked = useOIMComputedValue(spadesInOrder);
  return <ul>{ranked.map((s) => <li key={String(s.key)}>{s.entity?.title}</li>)}</ul>;
}
```

**What for:** a component that shows the value of one computed slot and must
re-render when it changes. It subscribes to the slot through `useOIMValue`
(`sourceComputeds: [computedSlot]`), which settles the slot before the read, and
reads `computedSlot.value`. The binding is memoised on the
slot, so there is nothing to keep stable. **When not:** a value that also needs
root slots or post-processing of the derivation's result. Use `useOIMValue` for that.

## `useOIMComputedValueByKey` — one key of a computed store slot

```tsx
function TopOfDeck({ deckId }: { deckId: string }) {
  const ranked = useOIMComputedValueByKey(byRankService.computedCollectionService, byRank, deckId);
  return <span>{ranked[0]?.entity?.title}</span>;
}
```

**What for:** a computed store slot (of `createOIMComputedService`, a sorted computed, a bucket memo) read by a
key the component chooses. Pass the computed service's `computedCollectionService`. It is the same body
as `useOIMEntity` and `useOIMBucketSlotsByKey`: the key is resolved with
`holdSlotByKey(computedStoreSlot, key)` when the subscription commits, the effect is built over that
computed slot (`sourceComputeds`), the resolve-hold goes straight back, and the
value is read through `computedSlot.computedValueService.getValueForSlot`, which settles it first.
A key built inline is settled by meaning, as for a bucket.

## `useOIMComputedCollection` — a keyed computed store slot the component owns

```tsx
const doubledRankService = createOIMComputedService<string, number>({});

function DoubledRank({ cardId }: { cardId: string }) {
  const doubledRanks = useOIMComputedCollection(
    doubledRankService,
    (computedSlot) => (cardService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? 0) * 2,
    (id) => ({ sourceSlots: [cardService.getSlotByKey(cards, id)] }),
    [],
  );
  return <span>{useOIMComputedValueByKey(doubledRankService.computedCollectionService, doubledRanks, cardId)}</span>;
}
```

**What for:** a keyed derivation scoped to one component, read by key with
`useOIMComputedValueByKey`. The computed SERVICE is yours, built once at module scope with
`createOIMComputedService(options)`, which takes no db; the hook only calls
`computedService.createComputedStoreSlot(db, derive, createSources)` with the `OIMDB` from the provider, in a
`useMemo` keyed on `deps`, and returns that store slot. `derive` and `createSources` may be `undefined` when the
service already has them. The store slot is rebuilt when `deps` change, and React may also rebuild it. Slots of
the old store slot go back when their effects are disposed, so nothing is kept. Each key's computed slot lives as
long as something subscribes to or holds it, as in any computed store slot.

## `useOIMSingleComputedValue` — a single computed the component owns

```tsx
const deckCardCountService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
  computedSlotStoreService:
    OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
});

function DeckCardCount({ deckId }: { deckId: string }) {
  const size = useOIMSingleComputedValue(
    deckCardCountService,
    () => deckIndexService.slotContentService.getBucketMemberSlotCount(deckIndexService.getSlotByKey(deckIndex, deckId)),
    () => ({ sourceSlots: [deckIndexService.getSlotByKey(deckIndex, deckId)] }),
    [deckId],
  );
  return <span>{size}</span>;
}
```

**What for:** a derivation only this component needs. The service is a void-keyed `createOIMComputedService`
over `OIMSlotStoreServiceSingleSlotDriven.INSTANCE`, built once at module scope. Per mount the hook builds a
store slot through `useOIMComputedCollection` and reads it through `useOIMComputedValueByKey` under the key
`undefined`, so the computed slot is resolved with `holdSlotByKey` when the subscription commits, and a flush
between the render and the subscription, which releases the slot the render minted, does not leave the component
on a released slot. Add both hooks to the additionalHooks option of `react-hooks/exhaustive-deps` in your own
config, so a prop that `derive` reads and `deps` omit is a lint error instead of a screen that silently shows the
old value. **When not:** several components read the same derivation. Build its store slot once in a module and
take `useOIMComputedValue`.

## `useOIMSingleEntity` and `useOIMSingleBucketSlots` — a single

A single is not a keyed collection: `createOIMSingleEntityService(db)` and `createOIMSingleBucketService(db)` return
an `OIMSingleSlotService`, whose doors are `getSingleSlot(storeSlot)` and `holdSingleSlot(storeSlot)`. Its two hooks
are the by-key mechanics without a key: `getSingleSlot` on render, `holdSingleSlot` on commit, the resolve-hold
given back once the effect exists.

```tsx
type Settings = { theme: string };

const settingsService = createOIMSingleEntityService<Settings>(db);
const settings = settingsService.createStoreSlot(db);
settingsService.slotContentService.upsertEntity(settings, { theme: 'dark' });

function Theme() {
  return <span>{useOIMSingleEntity(settingsService, settings)?.theme}</span>;
}
```

**What for:** a record with no key, whose store slot mints nothing until the first `upsertEntity`, an
ordinary announced write. `useOIMSingleEntity(singleSlotService, singleSlotStoreSlot)` returns
`TEntity | undefined`; on each subscribe it resolves the slot, minting a fresh one if it was released, holds it
while subscribed, and re-renders when the entity is written.

```tsx
const pickedService = createOIMSingleBucketService<TOIMEntitySlot<Card>>(db);
const picked = pickedService.createStoreSlot(db);

function Picked() {
  return <ul>{useOIMSingleBucketSlots(pickedService, picked).map((s) => <li key={String(s.key)}>{s.entity?.title}</li>)}</ul>;
}
```

**What for:** a bucket with no key. `useOIMSingleBucketSlots(singleSlotService, singleSlotStoreSlot)` subscribes
over the single bucket slot and copies the members into a readonly array on every render, as
`useOIMBucketSlotsByKey` does.

## `useOIMSlotsByKeys` — slots held for a component

```tsx
function DeckTopCard({ deckId }: { deckId: string }) {
  const [ranked] = useOIMSlotsByKeys(byRankService.computedCollectionService, byRank, [deckId]);
  const top = useOIMValue(useMemo(() => ({
    sourceComputeds: [ranked],
    derive: () => ranked.computedValueService.getValueForSlot(ranked)[0]?.entity?.title,
  }), [ranked]));
  return <span>{top}</span>;
}
```

**What for:** a component that reads derivations it should own. A computed slot is released at its last unhold
unless its service was given another `slotReleasePolicy`. A bare `getSlotByKey(computedStoreSlot, key)` mints one
into the unused-slot collector, and the next `flush()` takes it straight back, so each frame would rebuild it.
**When not:** the derivation must outlive every component that reads it. Hold it in a module.

It takes a collection service, a store slot and a list of keys. The service is anything with
`getSlotByKey(storeSlot, key)` and `holdSlotByKey(storeSlot, key)`: a computed collection service, an entity
collection, a bucket collection or an index. It returns the slots.

- It resolves twice, on purpose. The render goes through `getSlotByKey(storeSlot, key)`, whose mint the
  database's unused-slot collector takes back at the next `flush()`, so a render React
  throws away leaks nothing. The commit (a `useEffect`) then resolves the same keys through
  `holdSlotByKey(storeSlot, key)` and keeps that hold, one per key; on unmount, or when the key list moves, it gives
  back exactly the holds that commit took. If a `flush()` landed between the two and the commit resolved a different
  identity, the hook re-renders once so nothing downstream keeps a released slot.
- The key list may be built inline. It is settled by contents, so
  `[deckId]` costs a length check and one `===` per key on a render that did not
  change it, and takes no new holds.
- It owns a lifetime, not a subscription. Nothing here re-renders when a
  derivation's value moves; `useOIMValue` with the slot in `sourceComputeds` does
  that, as in the example. Hold with this hook, wake with that one.
- It needs no provider: it subscribes to nothing.

## Binding a derivation

A computed is a `TOIMComputedSlot` that you read only through its value service:
`slot.computedValueService.getValueForSlot(slot)`. `slot.value` compiles, but nothing
refreshes it when you read it. Bind a computed by putting its slot in
`sourceComputeds` and reading through `getValueForSlot` in `derive`. For one computed
slot, hand it to `useOIMComputedValue`, which does exactly that:

```tsx
const spadesCountService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
  sameValueGuard: oimSameValueZeroGuard,
  computedSlotStoreService:
    OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
});
const spadesCount = spadesCountService.createComputedStoreSlot(
  db,
  () => deckIndexService.slotContentService.getBucketMemberSlotCount(deckIndexService.getSlotByKey(deckIndex, 'spades')),
  () => ({ sourceSlots: [deckIndexService.getSlotByKey(deckIndex, 'spades')] }),
);
const spadesCountSlot = spadesCountService.computedCollectionService.holdSlotByKey(spadesCount, undefined);

function SpadesCount() {
  const count = useOIMComputedValue(spadesCountSlot);
  return <span>{count}</span>;
}
```

A derivation filters renders. Each frame the effect first refreshes its
`sourceComputeds`, then runs only when one of them, or one of its
`sourceSlots`, was stamped after its last run. A computed whose
`sameValueGuard` says the new value equals the old one keeps its stamp, so a write
under it that leaves the count unchanged renders nothing.

A sorted index bucket is a derivation too (`createOIMComputedServiceSorted`
over an index service, with `createSortedStoreSlot(indexStoreSlot)`), and a component can own a key of it
with `useOIMSlotsByKeys` (the `DeckTopCard` example above). Each derivation holds
its own sources: the index bucket for its key and one bucket column slot per sort
column. It re-sorts only when membership changes or a write changes one of its
columns on a member. Without `sortColumns` and `comparator` it compares nothing,
so the array keeps the members it already had in place and appends the ones that arrived.

An unsorted index bucket by key is `useOIMBucketSlotsByKey(deckIndexService, deckIndex, key)`. One held outside
React binds as a root:

```tsx
const spades = deckIndexService.holdSlotByKey(deckIndex, 'spades');

function Spades() {
  const slots = useOIMValue(useMemo(() => ({
    sourceSlots: [spades], derive: () => Array.from(deckIndexService.slotContentService.getBucketMemberSlots(spades)),
  }), []));
  return <ul>{slots.map((s) => <li key={String(s.key)}>{s.entity?.title}</li>)}</ul>;
}
```

A subscription is not woken for anything that happened before it. A `TOIMEffect` is
stamped with the channel clock at birth (`ranAtRevision` / `ranAtEpoch`), and
`oimHasSourceChangedSinceLastRun` compares strictly against that, so a frame runs the
body only when a source moved after the subscription — the first frame
included. A write that landed between the render and the subscription is still
shown, because of the counter bump on subscribing, not because of a wake. Every
hook here subscribes with `subscribeEffect`; `OIMEffectService.INSTANCE.createEffectImmediate` is the door
that runs the body at once.

## `useOIMDB`

```tsx
function FlushButton() {
  const providedDb = useOIMDB();
  return <button onClick={() => providedDb.flush()}>flush</button>;
}
```

The `OIMDB` from context, for a component that flushes or builds a store slot. It throws when there is no
`<OIMDBProvider>` above: `useOIMDB: no <OIMDBProvider db={...}> above this component.` The same throw has one
other cause: `@oimdb/react` loaded twice, once through `import` and once through `require`. A context is identified
by its object, so the provider of one copy is invisible to the hooks of the other.

## Notes

- Unmounting the last component watching a never-written key releases that
  identity under the default release policy (`OIMSlotReleasePolicyAtEmpty`, which
  releases an empty slot at its last unhold), so nothing leaks from watching a key
  that never arrives. A collection built with `OIMSlotReleasePolicyNever` keeps it.
- Every hook memoises its store on the inputs you pass: the collection service, the store slot, the settled key
  (or key list), the slot and the column name. Each input is either a scalar or an identity the
  collection interned. The inputs that could not be stable are a by-key hook's key
  and `useOIMSlotsByKeys`'s key list, which is why those hooks settle them. The one you have to keep stable is the
  binding handed to `useOIMValue`, and an unstable one hangs the screen.
- Your application writes a bucket's slots. A component that renders
  "the cards in deck X" is reading a list that something else keeps current. The hook
  subscribes to the bucket, and what puts entity slots in it is your write,
  typically from the same place that received the server response, never from a
  render. Or use an index (`createOIMIndexService`), which files entity slots automatically from its `keyOf`.
- A bucket never sorts. Its order is what your application wrote. A list
  sorted by a column is `createOIMComputedServiceSorted({ indexService, sortColumns })`
  over an index service. See [Binding a derivation](#binding-a-derivation).
- Construct services and their store slots in a module, not in a component. A second
  `createStoreSlot(db)` on a bucket collection is a second set of buckets whose
  slots nobody writes.
