---
sidebar_position: 5
title: React
description: Render engine state in React with one hook, useOIMSelector, covering one entity or field, lists whose rows re-render alone, index groups, sorted groups and derived values.
---

# React

Each recipe below is one `useOIMSelector` call. It reads the database the provider holds and re-renders the
component when something it read changes. The recipes cover:
- providing the database;
- one entity by key;
- one field of a wide entity;
- a list whose rows re-render one at a time;
- a group an index keeps;
- a group sorted by a column;
- a derived value;
- delivering once per painted frame.

```ts setup
import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  OIMDB, createOIMColumnGroup, createOIMEntitySlotCollectionStoreAggregate, createOIMSingleComputedService,
  createOIMSlotCollectionIndexStoreAggregate, createOIMSortedComputedService, isOIMSameValueZero,
} from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import { OIMDBProvider, useOIMSelector } from '@oimdb/react';

type Card = { id: string; deckId: string; title: string; rank: number };
type User = { id: string; name: string; avatarUrl: string; bio: string };

const createAppDB = () => new OIMDB({
  channelScheduler: (flush) => { void Promise.resolve().then(flush); },
  createSchemas: (db) => {
    const cards = createOIMEntitySlotCollectionStoreAggregate<Card>(db);
    const users = createOIMEntitySlotCollectionStoreAggregate<User>(db);
    const cardsByDeck = createOIMSlotCollectionIndexStoreAggregate(cards, { selectKey: (card: Card) => card.deckId });
    return { default: { cards, users, cardsByDeck } };
  },
});
const db = createAppDB();
const useAppSelector = useOIMSelector.withTypes<typeof db>();
```

## Give every hook the database

**Take:** `OIMDBProvider` once at the root, and `useOIMSelector.withTypes<typeof db>()` once in a module. Do not
pass aggregates down as props: the selector already receives the database, and its schemas are typed.

```tsx
function App({ children }: { children: ReactNode }) {
  return <OIMDBProvider db={db}>{children}</OIMDBProvider>;
}
```

**Why this way:** the provider carries the database and nothing else. `withTypes` is the same hook typed with
your database, so `appDb.schemas.default.cards` needs no cast. A test renders the same component under a provider
holding a fresh database.

**Reference:** [React](/docs/packages/react).

## Render one entity by its key

**Take:** `useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey(id).entity)`.

```tsx
function CardTitle({ cardId }: { cardId: string }) {
  const card = useAppSelector((appDb) => appDb.schemas.default.cards.getSlotByKey(cardId).entity);
  return <span>{card?.title ?? 'loading'}</span>;
}
```

**Why this way:**
- `getSlotByKey` hands back the one slot that key names, empty until its entity arrives.
- Reading `.entity` subscribes to that slot and nothing else, and the subscription holds it while the component is
  mounted.
- An in-place write keeps the entity's object reference, and the component still re-renders: what moved is the
  source, not the result.

**Reference:** [Reading and subscribing](/docs/core/reading-subscribing).

## Render one field of a wide entity

**Take:** a column group made once in a module, and `slot.getEntity(group)` in the selector. Do not use plain
`.entity`: it wakes on every column.

```tsx
const AVATAR = createOIMColumnGroup<keyof User & string>(['avatarUrl']);

function Avatar({ userId }: { userId: string }) {
  const avatarUrl = useAppSelector((appDb) => appDb.schemas.default.users.getSlotByKey(userId).getEntity(AVATAR)?.avatarUrl);
  return <img src={avatarUrl} alt="" />;
}
```

**Why this way:** a write to `bio` or `name` does not wake the component, and neither does any column outside the
group. Make the group once, outside the component: a group is a value the engine compares by identity.

**Reference:** [Column slots](/docs/core/collections).

## Render a list where each item re-renders alone

**Take:** the list selects keys, and each `memo` row selects its own entity by key.

```tsx
const DeckRow = memo(function DeckRow({ cardId }: { cardId: TOIMStoreKey }) {
  const card = useAppSelector((appDb) => appDb.schemas.default.cards.getSlotByKey(String(cardId)).entity);
  return <li>{card?.title}</li>;
});

function Deck({ deckId }: { deckId: string }) {
  const cardIds = useAppSelector((appDb) =>
    Array.from(appDb.schemas.default.cardsByDeck.getSlotByKey(deckId).getBucketMemberSlots(), (member) => member.key));
  return <ul>{cardIds.map((cardId) => <DeckRow key={String(cardId)} cardId={cardId} />)}</ul>;
}
```

**Why this way:**
- The list reads only the bucket's membership, so a title write does not re-render it.
- A row reads only its own entity, so a write reaches exactly one row.
- The rows take a primitive key, so `memo` keeps every row the list did not change.

**Reference:** [Index](/docs/core/oimindex).

## Render the group an index keeps

**Take:** `cardsByDeck.getSlotByKey(deckId)` inside the selector, and read the members there.

```tsx
function DeckSize({ deckId }: { deckId: string }) {
  const size = useAppSelector((appDb) => appDb.schemas.default.cardsByDeck.getSlotByKey(deckId).getBucketMemberSlotCount());
  return <span>{size} cards</span>;
}
```

**Why this way:** an index files every entity under the key it derives from it. A deck nobody wrote yet is an empty
bucket that fills when its first card is written, and the selector holds that bucket while it is mounted.

**Reference:** [Index](/docs/core/oimindex).

## Render a group sorted by a column

**Take:** `createOIMSortedComputedService({ indexService, sortColumns })` and its
`createSortedStoreSlot(indexStoreSlot)`, built once in a module. In the component, read the sorted slots by key
through `.value`. Do not sort inside the render: it would re-sort on every render and still not re-render when a
rank changes.

```tsx
const cardsByRankService = createOIMSortedComputedService({
  indexService: db.schemas.default.cardsByDeck.slotService,
  sortColumns: [{ columnName: 'rank', direction: 'asc' }],
});
const cardsByRank = cardsByRankService.createSortedStoreSlot(db.schemas.default.cardsByDeck.storeSlot);

const RankedRow = memo(function RankedRow({ cardId }: { cardId: TOIMStoreKey }) {
  return <li>{useAppSelector((appDb) => appDb.schemas.default.cards.getSlotByKey(String(cardId)).entity?.title)}</li>;
});

function RankedDeck({ deckId }: { deckId: string }) {
  const cardIds = useAppSelector(() => cardsByRankService.getSlotByKey(cardsByRank, deckId).value.map((slot) => slot.key));
  return <ol>{cardIds.map((cardId) => <RankedRow key={String(cardId)} cardId={cardId} />)}</ol>;
}
```

**Why this way:** each sorted derivation re-sorts only when membership changes, or when a write changes a sort
column on a member. A title write leaves the order alone and reaches one row. The selector's subscription holds the
derivation while the component is mounted.

**Reference:** [The order of a bucket is a derivation](/docs/core/computed-effects#the-order-of-a-bucket-is-a-derivation).

## Show a derived value

**Take:** the selector itself, when one component derives the value. When several components share it, use a
single computed with a `sameValueGuard`, built once in a module and read through `.value`.

```tsx
function DeckCount({ deckId }: { deckId: string }) {
  const count = useAppSelector((appDb) => appDb.schemas.default.cardsByDeck.getSlotByKey(deckId).getBucketMemberSlotCount());
  return <span>{count}</span>;
}

const heartsCountService = createOIMSingleComputedService<number>({ sameValueGuard: isOIMSameValueZero });
const hearts = db.schemas.default.cardsByDeck.getSlotByKey('hearts');
const heartsCount = heartsCountService.createStoreSlot(db, () => hearts.getBucketMemberSlotCount(), () => ({ sourceSlots: [hearts] }));

function HeartsBadge() {
  const count = useAppSelector(() => heartsCountService.getSingleSlot(heartsCount).value);
  return <span>{count} hearts</span>;
}

function OwnComputed({ deckId }: { deckId: string }) {
  const own = useMemo(() => {
    const bucket = db.schemas.default.cardsByDeck.getSlotByKey(deckId);
    return heartsCountService.createStoreSlot(db, () => bucket.getBucketMemberSlotCount(), () => ({ sourceSlots: [bucket] }));
  }, [deckId]);
  return <span>{useAppSelector(() => heartsCountService.getSingleSlot(own).value)}</span>;
}
```

**Why this way:** a computed whose `sameValueGuard` calls the new value equal to the old keeps its stamp. So a frame
in which one card leaves hearts and another arrives renders nothing. The selector subscribes to the computed, which
holds it while mounted; a computed a component builds in `useMemo` lives exactly that long.

**Reference:** [One derivation, no key](/docs/core/computed-effects#one-derivation-no-key).

## Deliver once per painted frame

**Take:** the `channelScheduler` option of `OIMDB`, with a `requestAnimationFrame` deferral. Do not use a database
with no scheduler: nothing is delivered until somebody calls `flush()`, so a write from an event handler would
never reach a component.

```tsx
const paintedDb = new OIMDB({
  channelScheduler: (flush) => { requestAnimationFrame(() => { flush(); }); },
  createSchemas: (database) => ({ default: { cards: createOIMEntitySlotCollectionStoreAggregate<Card>(database) } }),
});

function RenameButton({ cardId }: { cardId: string }) {
  return <button onClick={() => {
    paintedDb.schemas.default.cards.getSlotByKey(cardId).updateEntity({ title: 'Renamed' });
  }}>Rename</button>;
}
```

**Why this way:**
- The scheduler is called with the flush when the first write of a batch needs a frame, and not again until that
  frame has run. So everything written before the next paint is one frame, and every component it wakes is told once.
- A microtask deferral, `Promise.resolve().then(flush)`, makes one synchronous turn of the event loop the batch
  instead.
- The choice is made once, at construction, and no write asks which one it is on.

**Reference:** [Schedulers](/docs/core/channel#schedulers), [React](/docs/packages/react).
