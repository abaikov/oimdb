---
sidebar_position: 5
title: React
description: Render engine state in React, covering one entity or field, lists whose items re-render alone, index groups, sorted groups and derived values.
---

# React

Rendering engine state in React components: handing the hooks the database, one
entity by key, one field of a wide entity, a list whose items re-render one at a
time, a group an index keeps, a group sorted by a column, a derived value,
and flushing once per painted frame. Every hook that reads a store takes the
collection service first and the store slot after it.

```ts setup
import { memo } from 'react';
import type { ReactNode } from 'react';
import {
  OIMDB, OIMSlotContentBucketServiceSetDriven, OIMSlotStoreServiceSingleSlotDriven, createOIMBucketService,
  createOIMComputedService, createOIMComputedServiceSorted, createOIMEntityService, createOIMIndexService,
  oimSameValueZeroGuard,
} from '@oimdb/core';
import type { TOIMBucketSlotsSetStore, TOIMComputedSlot, TOIMEntitySlot, TOIMSingleSlotStore, TOIMStoreKey } from '@oimdb/core';
import {
  OIMDBProvider, useOIMBucketSlotsByKey, useOIMComputedValue, useOIMDB, useOIMEntity,
  useOIMField, useOIMSlotsByKeys,
} from '@oimdb/react';

type Card = { id: string; deckId: string; title: string; rank: number };
type User = { id: string; name: string; avatarUrl: string; bio: string };

const db = new OIMDB({ channelScheduler: (flush) => { void Promise.resolve().then(flush); } });
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const userService = createOIMEntityService<User>(db, { keyOf: (user) => user.id });
const users = userService.createStoreSlot(db);
const searchResultService = createOIMBucketService<
  TOIMEntitySlot<Card>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<Card>>,
  OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>() });
const searchResults = searchResultService.createStoreSlot(db);
const cardsByDeckService = createOIMIndexService(db, {
  entityService: cardService,
  keyOf: (card: Card) => card.deckId,
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const cardsByRankService = createOIMComputedServiceSorted({
  indexService: cardsByDeckService,
  sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const cardsByRank = cardsByRankService.createSortedStoreSlot(cardsByDeck);
```

## Give every hook the database

**Take:** `OIMDBProvider` with the database, once, above every component that uses a
hook. Not a context of your own holding the services and store slots: they are passed to
each hook as arguments, and only the database goes through context.

```tsx
function App({ children }: { children: ReactNode }) {
  return <OIMDBProvider db={db}>{children}</OIMDBProvider>;
}

function SaveButton() {
  const appDb = useOIMDB();
  return <button onClick={() => appDb.flush()}>Save</button>;
}
```

**Why this way:** every subscription in the engine is an effect on the database's channel slot, built by the
stateless `OIMEffectService.INSTANCE`, so the one thing a hook needs from context is the database.
`useOIMDB` throws outside a provider. The message also names the other cause of the same symptom: `@oimdb/react`
loaded twice, once through `import` and once through `require`, so the provider
of one copy is invisible to the hooks of the other. Build services and store slots in a
module, not in a component: a store slot built in a render is a second set of
identities nothing else writes.

**Reference:** [React — `OIMDBProvider` and its context](/docs/packages/react#oimdbprovider-and-its-context).

## Render one entity by its key

**Take:** `useOIMEntity(entityCollectionService, entityStoreSlot, key)`. Not `useOIMValue` with a binding of
your own over `getSlotByKey`: that resolves the key during the render, and the
hook already resolves it at the one moment when that is safe.

```tsx
function CardTitle({ cardId }: { cardId: string }) {
  const card = useOIMEntity(cardService, cards, cardId);
  if (card === undefined) return <span>Loading…</span>;
  return <h2>{card.title}</h2>;
}
```

**Why this way:** it returns the entity, or `undefined` until something writes
the key, and re-renders when the entity slot is written. The render reads
`getSlotByKey(entityStoreSlot, key)`, whose mint goes to the unused-slot collector, so a render
React throws away leaves nothing standing past the next flush; the counted hold
is taken in `subscribe`, when the component commits, and the effect's own hold
then keeps the identity until unmount or a key change. Unmounting the last
component watching a key that never arrived releases it under the default
`OIMSlotReleasePolicyAtEmpty`.

**Reference:** [React — `useOIMEntity`](/docs/packages/react#useoimentity--one-entity-by-key).

## Render one field of a wide entity

**Take:** `useOIMField(entityCollectionService, slot, name)`, with the collection service
whose store slot holds `slot`. Not `useOIMEntity`, which re-renders on a write to
any column.

```tsx
function Avatar({ user }: { user: TOIMEntitySlot<User> }) {
  const avatarUrl = useOIMField(userService, user, 'avatarUrl');
  return <img src={avatarUrl} alt="" />;
}

const signedInUser = userService.holdSlotByKey(users, 'u1');

function ProfileHeader() {
  return <Avatar user={signedInUser} />;
}
```

**Why this way:** a column is an identity of its own, filed on the entity slot,
and a write marks only the column slots of the columns it changed, so an edit to
`bio` never reaches this component. The slot comes from whoever already holds
it — a module, as here, or a parent rendering a bucket's slots. The hook subscribes over the column slot
`getColumn(slot, name)` mints and holds the entity slot itself while subscribed,
because the effect counts the column and not the slot that carries it. `name` is
checked against the entity type, so a typo is a compile error. For a component
that shows several columns, one `useOIMEntity` is one subscription and several
`useOIMField` calls are several.

**Reference:** [React — `useOIMField`](/docs/packages/react#useoimfield--one-field-of-one-identity),
[Subscribing to one column](/docs/core/reading-subscribing#subscribing-to-one-column).

## Render a list where each item re-renders alone

**Take:** `useOIMBucketSlotsByKey(bucketCollectionService, bucketStoreSlot, key)` in the list, and a
memoised item component that subscribes to its own entity with `useOIMEntity`.
Not a list component that reads every title itself: it would re-render only when
the membership moves, and a title write would never reach it.

```tsx
const CardItem = memo(function CardItem({ cardId }: { cardId: string }) {
  const card = useOIMEntity(cardService, cards, cardId);
  return <li>{card?.title}</li>;
});

function SearchResults({ query }: { query: string }) {
  const slots = useOIMBucketSlotsByKey(searchResultService, searchResults, query);
  return <ul>{slots.map((slot) => <CardItem key={String(slot.key)} cardId={String(slot.key)} />)}</ul>;
}

declare const found: readonly Card[];
const aceResults = searchResultService.holdSlotByKey(searchResults, 'ace');
searchResultService.slotContentService.writeBucketMemberSlots(aceResults, cardService.slotContentService.upsertEntities(cards, found));
aceResults.owner.unholdSlot(aceResults);
```

**Why this way:** the bucket slot is written when its member list changes, and
an entity slot when its entity does, so the two subscriptions split the work: a
result arriving or leaving re-renders the list, a title write re-renders one
item, and `memo` keeps the others from re-rendering with the list. The hook owns
the bucket's lifetime — it resolves with `holdSlotByKey` on commit, never in a
render, and gives the count back on unmount and on every key change — and the
key may be built inline. What fills the bucket is your write, here
`writeBucketMemberSlots` with the slots `upsertEntities` returns; a bucket never sorts
and never fills itself.

**Reference:** [React — `useOIMBucketSlotsByKey`](/docs/packages/react#useoimbucketslotsbykey--one-bucket-by-key),
[A bucket's slots are the caller's](/docs/core/indexes#a-buckets-slots-are-the-callers).

## Render the group an index keeps

**Take:** `useOIMBucketSlotsByKey(cardsByDeckService, cardsByDeck, deckId)`: an index service and its index
store slot fit the hook as a bucket collection does.

```tsx
const CardItem = memo(function CardItem({ cardId }: { cardId: string }) {
  const card = useOIMEntity(cardService, cards, cardId);
  return <li>{card?.title}</li>;
});

function Deck({ deckId }: { deckId: string }) {
  const slots = useOIMBucketSlotsByKey(cardsByDeckService, cardsByDeck, deckId);
  return <ul>{slots.map((slot) => <CardItem key={String(slot.key)} cardId={String(slot.key)} />)}</ul>;
}
```

**Why this way:** an index files each entity under `keyOf` by itself, and writes
the bucket slot when a member arrives or leaves, so the list re-renders on
membership and each item on its own entity. For a group in a column order, own a
derivation over the index instead, as in the next recipe.

**Reference:** [React — `useOIMBucketSlotsByKey`](/docs/packages/react#useoimbucketslotsbykey--one-bucket-by-key),
[Indexes](/docs/core/oimindex).

## Render a group sorted by a column

**Take:** `createOIMComputedServiceSorted({ indexService, sortColumns })` and its
`createSortedStoreSlot(indexStoreSlot)` in a module; in the component,
`useOIMSlotsByKeys(cardsByRankService.computedCollectionService, cardsByRank, [key])` to own the
derivation and `useOIMComputedValue(ranked)` to re-render.
Not a sort inside the render: it would re-sort on every render and still not
re-render when a rank changes.

```tsx
const CardItem = memo(function CardItem({ cardId }: { cardId: string }) {
  const card = useOIMEntity(cardService, cards, cardId);
  return <li>{card?.title}</li>;
});

function RankedDeck({ deckId }: { deckId: string }) {
  const [ranked] = useOIMSlotsByKeys(cardsByRankService.computedCollectionService, cardsByRank, [deckId]);
  const slots = useOIMComputedValue(ranked);
  return <ol>{slots.map((slot) => <CardItem key={String(slot.key)} cardId={String(slot.key)} />)}</ol>;
}
```

**Why this way:** each derivation holds its own sources — the index bucket for
its key and one bucket column slot per sort column — and re-sorts only when
membership changes or a write changes a sort column on a member, so a title
write leaves the order alone and reaches one item. A computed is read only
through its value service: `getValueForSlot` settles it first, while `slot.value` is not
refreshed outside an effect body. A computed releases a derivation at
its last unhold, so `useOIMSlotsByKeys` is what keeps it alive while the
component is mounted; it owns a lifetime, not a subscription, which is why
`useOIMComputedValue` sits beside it. `useOIMComputedValueByKey` does both in one hook.

**Reference:** [React — `useOIMSlotsByKeys`](/docs/packages/react#useoimslotsbykeys--slots-held-for-a-component),
[The order of a bucket is a derivation](/docs/core/computed-effects#the-order-of-a-bucket-is-a-derivation).

## Show a derived value

**Take:** a void-keyed computed service from `createOIMComputedService<void, V, …>` with a
`sameValueGuard` and `OIMSlotStoreServiceSingleSlotDriven.INSTANCE` as its `computedSlotStoreService`,
the store slot from its `createComputedStoreSlot(db, derive, createSources)`, its slot held in a module with
`computedCollectionService.holdSlotByKey(storeSlot, undefined)`, and `useOIMComputedValue` with that
slot. Not a value computed in the render from the raw data: the component would have to subscribe to every input
and re-render on each of them.

```tsx
const hearts = cardsByDeckService.holdSlotByKey(cardsByDeck, 'hearts');
const heartsCountService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
  sameValueGuard: oimSameValueZeroGuard,
  computedSlotStoreService:
    OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
});
const heartsCount = heartsCountService.createComputedStoreSlot(
  db,
  () => cardsByDeckService.slotContentService.getBucketMemberSlotCount(hearts),
  () => ({ sourceSlots: [hearts] }),
);
const heartsCountSlot = heartsCountService.computedCollectionService.holdSlotByKey(heartsCount, undefined);

function HeartsBadge() {
  const count = useOIMComputedValue(heartsCountSlot);
  return <span>{count} hearts</span>;
}
```

**Why this way:** a derivation filters renders. Each frame the effect first
refreshes its `sourceComputeds`, then runs only when one of them was stamped
after its last run, and a computed whose `sameValueGuard` calls the new value
equal to the old keeps its stamp — a frame in which one card leaves hearts and
another arrives renders nothing. `useOIMComputedValue` settles the
computed through its value service before reading it, because a derivation is asked,
never woken. The default release policy of a computed is
`OIMSlotReleasePolicyAtUnhold`, so the module-level hold is what keeps it between
components.

**Reference:** [React — Binding a derivation](/docs/packages/react#binding-a-derivation),
[One derivation, no key](/docs/core/computed-effects#one-derivation-no-key).

## Deliver once per painted frame

**Take:** the `channelScheduler` option of `OIMDB`, with a
`requestAnimationFrame` deferral. Not a db with no scheduler: nothing is
delivered until somebody calls `flush()`, so a write from an event handler would
never reach a component.

```tsx
const paintedDb = new OIMDB({
  channelScheduler: (flush) => { requestAnimationFrame(() => { flush(); }); },
});
const paintedCardService = createOIMEntityService<Card>(paintedDb, { keyOf: (card) => card.id });
const paintedCards = paintedCardService.createStoreSlot(paintedDb);

function PaintedApp({ children }: { children: ReactNode }) {
  return <OIMDBProvider db={paintedDb}>{children}</OIMDBProvider>;
}

function RenameButton({ cardId }: { cardId: string }) {
  return <button onClick={() => {
    paintedCardService.slotContentService.updateEntity(paintedCardService.getSlotByKey(paintedCards, cardId), { title: 'Renamed' });
  }}>Rename</button>;
}
```

**Why this way:** the scheduler is called with the flush when the
first write of a batch needs a frame, and not again until that frame has run, so
everything written before the next paint is one frame: every effect runs once,
and every component it wakes is told once. A microtask deferral,
`Promise.resolve().then(flush)`, makes one synchronous turn of the event loop the
batch instead. The scheduler returns nothing, so a scheduled frame cannot be
recalled; a manual `flush()` before it arrives leaves it nothing to do. The choice
is made once, at construction, and no write asks which one it is on.

**Reference:** [Schedulers](/docs/core/channel#schedulers),
[React](/docs/packages/react).
