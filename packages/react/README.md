# @oimdb/react

React bindings for `@oimdb/core`. There is one binding hook and a handful of wrappers around it:
two that save you from writing `useMemo` at every call site, three that resolve a key and own
that lifetime for you, and two that own a computed store slot for the component. One more hook
owns a lifetime and takes no subscription at all, for the derivations a component reads.

```bash
npm install @oimdb/react @oimdb/core
```

## Why one binding

Subscribing in this engine is one call: `OIMEffectService.INSTANCE.subscribeEffect(db, sourceSlots, sourceComputeds, body)`.
It carries no value; what changed is read off the slots afterwards. So a component needs
exactly three things: the roots a write can reach, the derivations to ask before reading,
and the derive function. Together they make up `TOIMBinding`, and `useOIMValue` is the hook that applies it through
`useSyncExternalStore`.

```ts signature
type TOIMBinding<TValue> = {
    readonly sourceSlots?: readonly TOIMSlot[];
    readonly sourceComputeds?: readonly TOIMComputedSlot[];
    readonly derive: () => TValue;
};
```

Both source keys are optional; a missing one means none.

## A complete example

The store is created once, outside React, and shared by every example on this page.
A service is built once per type, at module scope, and holds no data; `createStoreSlot(db)` makes one
instance, a store slot, and every store door of the service takes that store slot first.
Whatever a read mints is swept at the end of the frame unless something took a real reference to it.

```ts setup
import { OIMDB, createOIMBucketService, createOIMEntityService, type TOIMEntitySlot } from '@oimdb/core';

type TCard = { id: string; deckId: string; title: string; rank: number };

export const db = new OIMDB();

export const cardService = createOIMEntityService<TCard>(db, { keyOf: (card) => card.id });
export const cards = cardService.createStoreSlot(db);

// A bucket keeps the order the caller writes; a sorted list is
// `createOIMComputedServiceSorted` over an index.
export const byDeckService = createOIMBucketService<TOIMEntitySlot<TCard>>(db);
export const byDeck = byDeckService.createStoreSlot(db);

// A BUCKET'S SLOTS ARE YOURS. A write moves the card's value and files nothing, so the
// code that writes a deck also says who is in it. `byDeckService.holdSlotByKey` is the door onto a
// bucket by key: it mints one if there is none and hands back the bucket itself,
// counted. `owner.unholdSlot` gives that count back, once the bucket's own slots keep it.
export function setDeck(deckId: string, cardsInDeck: readonly TCard[]): void {
    cardService.slotContentService.upsertEntities(cards, cardsInDeck);
    const bucket = byDeckService.holdSlotByKey(byDeck, deckId);
    byDeckService.slotContentService.writeBucketMemberSlots(
        bucket, cardsInDeck.map((card) => cardService.getSlotByKey(cards, card.id)),
    );
    bucket.owner.unholdSlot(bucket);
}
```

```tsx
import { OIMDBProvider, useOIMEntity, useOIMBucketSlotsByKey } from '@oimdb/react';

function App() {
    return (
        <OIMDBProvider db={db}>
            <Card pk="c1" />
            <DeckList deckId="d1" />
        </OIMDBProvider>
    );
}

// One entity, by key.
function Card({ pk }: { pk: string }) {
    const card = useOIMEntity(cardService, cards, pk);
    return <span>{card?.title}</span>;
}

// One group, by key. The hook resolves it, holds it while this component is
// mounted, and gives the hold back when it unmounts or when `deckId` moves —
// there is no release to remember here.
function DeckList({ deckId }: { deckId: string }) {
    const deckCards = useOIMBucketSlotsByKey(byDeckService, byDeck, deckId);
    return <ul>{deckCards.map((s) => <li key={String(s.key)}>{s.entity?.title}</li>)}</ul>;
}
```

## The provider

**`<OIMDBProvider db={db}>`** puts the database in context (`OIMDBContext`), and every hook except
`useOIMSlotsByKeys` reads it through `useOIMDB()`. The effect service is stateless
(`OIMEffectService.INSTANCE`) and takes the database as its channel map, so there is nothing else
to provide. A slot filed on another `OIMDB` than the provider's would never wake the component, so
the hooks that resolve or take a slot check that its store slot runs on `db.defaultChannelSlot` and
throw when it does not.

## The hooks

Every hook that reads a collection takes the collection service first and the store slot second.
The parameter is typed as a `Pick` of `OIMSlotCollectionService` with only the members the hook calls.

- **`useOIMValue(binding)`**: the binding. It subscribes one effect over the binding's roots and
  derivations (the effect holds each of them for as long as it lives), settles the derivations before
  every read, and re-renders when the effect fires. **The binding must keep its identity across renders.** See
  [the requirement](#the-binding-you-hand-useoimvalue-must-keep-its-identity); breaking it
  causes a hang, not a slow path.
- **`useOIMComputedValue(computedSlot)`**: the value of ONE computed slot, re-rendering
  when it changes. It is `useOIMValue` over `sourceComputeds: [computedSlot]`, with the
  value read off `computedSlot.value` after `useOIMValue` settles it.
- **`useOIMEntity(entityCollectionService, entityStoreSlot, key)`**: one entity, by key. The key is resolved
  to an identity ON COMMIT, not on render, through `holdSlotByKey(entityStoreSlot, key)`: a render is not a
  lifetime, and an identity a discarded render minted would have no hold to give back. The render path reads
  `getSlotByKey(entityStoreSlot, key)`, so the first paint shows current state. That read mints when the key
  has none, but the mint goes to the database's unused-slot collector, so a render that never commits leaves
  nothing standing past the next `db.flush()`.
- **`useOIMField(entityCollectionService, slot, name)`**: one field of one identity, through an
  effect on `entityCollectionService.getColumn(slot, name)`. `name` is a column of that slot's entity, so a typo is a
  compile error and the value comes back with the type that column holds. It re-renders when
  that field changes and for no other reason. `slot` is an ENTITY slot: the subscription holds the identity it
  did not resolve.
- **`useOIMBucketSlots(bucketCollectionService, bucketSlot)`**: a bucket's slots as a readonly array, in that
  bucket's order, read through `bucketCollectionService.slotContentService.getBucketMemberSlots`. The array is
  copied only when the bucket slot's change stamp (`changedAtRevision`, `changedAtEpoch`) moved. That stamp is
  reliable here because the caller holds the bucket: a write to a slot nothing holds is not stamped.
- **`useOIMBucketSlotsByKey(bucketCollectionService, bucketStoreSlot, key)`**: one bucket by key, as an array of
  entity slots. It resolves the bucket on commit, holds it for as long as the component is mounted, and gives the
  hold back on unmount or when the key changes. It copies the members on every render: the bucket it reads during a
  render may be held by nothing yet, and an unheld bucket's stamp does not move. **The key may be built inline**,
  including the array that keys an `OIMSlotStoreServiceTreeDriven`; the hook settles it by asking the store which
  bucket each key names.
- **`useOIMSlotsByKeys(slotCollectionService, storeSlot, keys)`**: several identities of one store slot,
  resolved by key and held for as long as the component is mounted. It returns the slots and takes no subscription,
  so use it when a component reads **derivations**: a computed slot exists only while something holds it, and a bare
  read mints one that the next `flush()` takes straight back. See [Holds per component](#holds-per-component).
- **`useOIMComputedValueByKey(computedCollectionService, computedStoreSlot, key)`**: the value of one key of a
  computed store slot. Pass `computedService.computedCollectionService`. It has the same body as `useOIMEntity`:
  it resolves with `holdSlotByKey` on commit, subscribes over that computed slot, gives the resolve-hold straight
  back, and reads the value through `computedSlot.computedValueService.getValueForSlot`.
- **`useOIMComputedCollection(computedService, derive, createSources, deps)`**: a keyed computed store slot the
  component owns. The SERVICE is yours, built once at module scope with `createOIMComputedService(options)`; the hook
  only calls `computedService.createComputedStoreSlot(db, derive, createSources)` in a `useMemo` keyed on `deps`, and
  returns that store slot. `derive` and `createSources` may be `undefined` when the service already has them.
  Read it by key with `useOIMComputedValueByKey(computedService.computedCollectionService, computedStoreSlot, key)`.
- **`useOIMSingleComputedValue(computedService, derive, createSources, deps)`**: a single computed the component
  owns, read under the key `undefined`. The service is a void-keyed `createOIMComputedService` with
  `computedSlotStoreService: OIMSlotStoreServiceSingleSlotDriven.INSTANCE`, built once at module scope. Per mount
  the hook builds a store slot through `useOIMComputedCollection` and reads it through `useOIMComputedValueByKey`,
  so a flush between render and subscribe, which releases the slot the render minted, is safe.
- **`useOIMSingleEntity(singleSlotService, singleSlotStoreSlot)`** and
  **`useOIMSingleBucketSlots(singleSlotService, singleSlotStoreSlot)`**: the single entity and the single bucket.
  See [Singles](#singles).
- **`useOIMDB()`**: the `OIMDB` from `OIMDBContext`. It throws if used outside `<OIMDBProvider>`.

```tsx
import { OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService } from '@oimdb/core';
import type { TOIMComputedSlot, TOIMSingleSlotStore } from '@oimdb/core';
import { useOIMSingleComputedValue } from '@oimdb/react';

// Module scope: one service per kind of computed, shared by every component.
const totalRankService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService:
        OIMSlotStoreServiceSingleSlotDriven.INSTANCE as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
});

function TotalRank({ ids }: { ids: readonly string[] }) {
    // Per mount: one store slot with its own derive and sources.
    const total = useOIMSingleComputedValue(
        totalRankService,
        () => ids.reduce((sum, id) => sum + (cardService.getSlotByKey(cards, id).entity?.rank ?? 0), 0),
        () => ({ sourceSlots: ids.map((id) => cardService.getSlotByKey(cards, id)) }),
        [ids.join()],
    );
    return <span>{total}</span>;
}
```

## Singles

A single is a store slot that holds ONE identity and has no key: `createOIMSingleEntityService(db)` and
`createOIMSingleBucketService(db)` hand back an `OIMSingleSlotService`, read through `getSingleSlot(storeSlot)` and
`holdSingleSlot(storeSlot)`. The two single hooks take that service (typed as a `Pick` of `OIMSingleSlotService`)
and its store slot, and have the by-key hooks' mechanics without the key: the render reads `getSingleSlot`, whose
mint the next `flush()` takes back if no commit follows; the commit resolves with `holdSingleSlot`, subscribes over
that slot and gives the resolve-hold straight back, so a single released while nothing watched it is minted afresh.

```tsx
import { createOIMSingleBucketService, createOIMSingleEntityService } from '@oimdb/core';
import { useOIMSingleBucketSlots, useOIMSingleEntity } from '@oimdb/react';

type TSettings = { theme: string };

const settingsService = createOIMSingleEntityService<TSettings>(db);
const settings = settingsService.createStoreSlot(db);

const pickedService = createOIMSingleBucketService<TOIMEntitySlot<TCard>>(db);
const picked = pickedService.createStoreSlot(db);

function Toolbar() {
    const theme = useOIMSingleEntity(settingsService, settings)?.theme;
    const pickedCards = useOIMSingleBucketSlots(pickedService, picked);
    return <span>{theme}: {pickedCards.length} picked</span>;
}
```

`useOIMSingleBucketSlots` copies the members on every render, for the same reason as `useOIMBucketSlotsByKey`.
A single computed is `useOIMSingleComputedValue`.

## Binding a derivation

`createOIMComputedService` and `createOIMComputedServiceBucketMemo` both hand back a service of computed slots,
whose store slot holds them. You can either hold the key where the lifetime is (a module, your own store) and bind
it with `useOIMValue`, or let the component own the lifetime with `useOIMSlotsByKeys`.

`useOIMValue` produces the binding's derivations before every read, because a derivation is
asked and never woken. Only a computed slot's `computedValueService.getValueForSlot` produces its value, so a
`derive` that reaches a derivation's result any other way would show whatever the last produce left there.

**No wake is owed for what happened before the subscription.** An effect is stamped with the channel clock at
birth (`ranAtRevision` / `ranAtEpoch`), so a frame runs the body only when a source moved *after* the subscription.
Every hook here subscribes with `subscribeEffect`; `OIMEffectService.INSTANCE.createEffectImmediate` is the door
that delivers a value at once.

## Holds per component

`useOIMSlotsByKeys` holds every identity its keys name for as long as the component is mounted: on commit it
resolves each key through `holdSlotByKey(storeSlot, key)` and keeps that hold, and on unmount (or when the key list
moves) it gives back exactly the holds that commit took.

```tsx
import { createOIMComputedService, oimSameValueZeroGuard } from '@oimdb/core';
import { useOIMSlotsByKeys } from '@oimdb/react';

const rankService = createOIMComputedService<string, number>({
    createSources: (id) => ({ sourceSlots: [cardService.getSlotByKey(cards, id)] }),
    derive: (computedSlot) => cardService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
    sameValueGuard: oimSameValueZeroGuard,
});
const ranks = rankService.createComputedStoreSlot(db);

function Hand({ ids }: { ids: readonly string[] }) {
    const slots = useOIMSlotsByKeys(rankService.computedCollectionService, ranks, ids);
    return <ul>{slots.map((s) => <li key={String(s.key)}>{s.computedValueService.getValueForSlot(s)}</li>)}</ul>;
}
```

- **It resolves twice, on purpose.** The render goes through `getSlotByKey(storeSlot, key)`, whose mint the
  database's unused-slot collector takes back at the next `flush()`, so a render that React throws away leaks
  nothing. The commit then resolves the same keys through `holdSlotByKey(storeSlot, key)`. If a `flush()` landed
  between the two and the commit therefore resolved a *different* identity, the hook re-renders once so nothing
  downstream is left holding a released slot.
- **The key list may be built inline.** It is settled by contents, so `ids={['a', 'b']}` costs a length check and
  two `===` on a render that did not change it, and takes no new holds.
- **It owns a lifetime, not a subscription.** Nothing here re-renders when a derivation's value moves; `useOIMValue`
  does that. Hold with this hook, wake with that one. It needs no provider because it subscribes to nothing.

## The binding you hand `useOIMValue` must keep its identity

This is a hard requirement. Getting it wrong costs more than an allocation: it hangs the screen.

```tsx
import { useMemo } from 'react';
import { useOIMValue } from '@oimdb/react';

function Deck({ bucket }: { bucket: ReturnType<typeof byDeckService.getSlotByKey> }) {
    // DO NOT. A new binding every render, and this never stops rendering.
    const unstable = useOIMValue({ sourceSlots: [bucket],
                                   derive: () => Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket)) });

    // Do. The binding is memoised on what it was built from.
    const stable = useOIMValue(useMemo(() => ({
        sourceSlots: [bucket],
        derive: () => Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket)),
    }), [bucket]));

    return <span>{unstable.length + stable.length}</span>;
}
```

The first form misses `useOIMValue`'s memo on every render, which gives `subscribe` a new
identity, and React responds by resubscribing on every commit. The counter bump on
`subscribe`'s first line then makes React's post-commit version check differ, so React forces another
render, which builds another binding. **Nothing converges.** React logs
`Maximum update depth exceeded`, which is a `console.error` and not a throw, so you
get a frozen screen and a growing console instead of an error you can catch.

`useOIMField` and `useOIMBucketSlots` exist to write that `useMemo` once, so no call site has to.

**This requirement does not apply to the key of a by-key hook.** `useOIMEntity`,
`useOIMBucketSlotsByKey`, `useOIMComputedValueByKey` and, through it, `useOIMSingleComputedValue`
share one body, because their key cannot be kept stable: a tree-driven key is an *array*. So the hook settles its
key before its memo sees it, by asking the collection which identity each names. Two keys that resolve to one
identity are one key.

## Things worth knowing

- **The snapshot `useOIMValue` compares is a local counter, not the value.** `createOIMEntityWriterInPlace` keeps
  an entity's object reference stable, a bucket hands its slots back as the same live container, and a column
  subscription fires only for its own column; a value-comparing binding would fire on none of the three. The counter
  is bumped ON SUBSCRIBING too, so a write that lands between the render and the subscription is still shown. The
  price is one extra render per SUBSCRIPTION commit, not per render and not per notification.
- **A subscription holds what it reads, and gives it back when it is torn down.** The by-key hooks resolve with
  `holdSlotByKey` and give that hold straight back once the effect exists, so no root is counted twice.
  `useOIMField` holds its ENTITY slot for itself; its root is the COLUMN, minted inside the subscription.
- **Services are yours, at module scope.** The provider carries the database and nothing else. A computed service
  is one per kind of computed; a component that owns a computed gets only a store slot from
  `useOIMComputedCollection` / `useOIMSingleComputedValue`.
- **Nothing re-files an entity when it is written into a bucket you maintain.** Write the buckets in the same code
  that writes the entity, or use an index service (`createOIMIndexService`), which files entities by the key it
  derives from each one.
- **A bucket never sorts.** A list sorted by a column is `createOIMComputedServiceSorted({ indexService, sortColumns })`
  over an index service, with `createSortedStoreSlot(indexStoreSlot)`.

## Reference

The full core API is in **`llms.txt`**, which ships inside this package: read it beside this
README in the installed package, or
[on GitHub](https://github.com/abaikov/oimdb/blob/master/llms.txt).
