---
sidebar_position: 1.5
title: Why OIMDB
description: When to choose OIMDB, what a small state manager leaves to you, the same task on zustand, alien-signals and OIMDB, the architecture and its trade-offs against signal libraries, and the bundle cost.
---

# Why OIMDB

## When to take it

OIMDB is for applications built around collections: cards, messages, tasks,
anything with an id that appears in more than one place on screen. If the same
entity shows up in two lists, a detail pane and a counter, OIMDB keeps one copy of
it, files it into every index that needs it, and wakes only the components that
read what changed.

If the state is a handful of global values, such as a theme or the signed-in user,
with no collections behind them, use a signal library or a bare store. OIMDB's
slot machinery and its bundle (see
[Bundle size](/docs/performance/bundle-size)) buy nothing there.
If the only job is to remember request responses, use a query cache.

Without a collection layer, teams usually end up in one of four places. Some
fetch a list, render it and throw it away, so the same card on a second screen is
fetched again and drifts out of sync with the first. Some keep the data in a
component's state, which works until a second component needs the same cards.
Some take a query cache such as React Query: fetching is solved, but the cache is
keyed by request, so one card in two queries is two copies, and every mutation
needs an invalidation or a hand-written update of each query that might hold it.
The rest take a bare store and write the collection layer on top, which is what
the next two sections are about.

## What a small state manager leaves to you

redux, zustand, a query cache and a signal library each solve one part of the
problem. None of them ships normalised collections, indexes that follow a write,
sorted views, per-column subscriptions, a lifetime for data nobody looks at, or
persistence. Some of that you can write yourself as a layer on top, and some of
it you cannot finish without changing the engine underneath.

### What a layer on top can do

Grouping, sorting and batching the writes of one turn all sit comfortably above a
store. You keep an id list per group, sort it in a memoised selector or a
computed, and wrap bulk writes in whatever batch primitive the store offers. The
zustand and alien-signals versions below do exactly that.

### What needs the engine changed

The sharpest case is removing a member of a keyed family. In a signal library a
member is an object, and its identity is the object reference. Delete it from the
family's map and every effect or component that still holds the reference keeps
reading a node that nobody updates and that is never told it is gone. Create a new
member under the same key and the old holders and the new ones sit on two
different objects that will never agree. Fixing this properly takes three things
the library does not have: a "removed" state on the node that its readers observe,
an assert on every later use of a removed node, and holds that decide when the node
may really go. Together that is a lifetime model, and it has to live in the engine.

Two more gaps have the same character. A store that keeps every entry until the
garbage collector takes it cannot drop data on a policy (after a TTL, after a
period of idleness, when the last reader leaves) while the key stays addressable.
And writing a whole object or a patch while waking only the readers of the columns
that actually moved requires the store to know about columns, not just values.

OIMDB has this lifetime model in the engine. A key resolves to a slot, and the slot
outlives its data: when the entity is deleted, readers see the slot as empty
rather than holding a stale object. When a slot is finally released, any later
use of it throws, and the error tells you to resolve the key afresh. When data
leaves is decided by a release policy chosen when the service is constructed.

## One task, three implementations

Cards belong to decks. Each implementation below does the same six things:

1. Load a page of cards in one batch, with one notification for the whole page.
2. Show a deck sorted by rank, each card rendered by its own component.
3. Edit a card's title. Only that card re-renders, and the deck's order is not
   recomputed.
4. Move a card to another deck: both decks' membership follows.
5. Remove a card.
6. Free a deck's sorted order when no component shows the deck.

Each ends with the same script: load three cards into the red deck, edit the title
of the first, move the second to the black deck, and remove the third.

### zustand

```tsx
import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

type Card = { id: string; deck: string; title: string; rank: number };

type CardsState = {
    byId: Record<string, Card>;
    idsByDeck: Record<string, string[]>;
    upsertMany: (cards: readonly Card[]) => void;
    update: (id: string, patch: Partial<Card>) => void;
    remove: (id: string) => void;
};

const without = (ids: readonly string[] | undefined, id: string): string[] =>
    (ids ?? []).filter((other) => other !== id);

export const useCards = create<CardsState>()((set) => ({
    byId: {},
    idsByDeck: {},
    upsertMany: (cards) => set((state) => {
        const byId = { ...state.byId };
        const idsByDeck = { ...state.idsByDeck };
        for (const card of cards) {
            const previous = byId[card.id];
            if (previous !== undefined && previous.deck !== card.deck) {
                idsByDeck[previous.deck] = without(idsByDeck[previous.deck], card.id);
            }
            if (previous === undefined || previous.deck !== card.deck) {
                idsByDeck[card.deck] = [...(idsByDeck[card.deck] ?? []), card.id];
            }
            byId[card.id] = card;
        }
        return { byId, idsByDeck };
    }),
    update: (id, patch) => set((state) => {
        const previous = state.byId[id];
        if (previous === undefined) return state;
        const card = { ...previous, ...patch };
        const byId = { ...state.byId, [id]: card };
        if (card.deck === previous.deck) return { byId };
        return {
            byId,
            idsByDeck: {
                ...state.idsByDeck,
                [previous.deck]: without(state.idsByDeck[previous.deck], id),
                [card.deck]: [...(state.idsByDeck[card.deck] ?? []), id],
            },
        };
    }),
    remove: (id) => set((state) => {
        const card = state.byId[id];
        if (card === undefined) return state;
        const { [id]: _removed, ...byId } = state.byId;
        return { byId, idsByDeck: { ...state.idsByDeck, [card.deck]: without(state.idsByDeck[card.deck], id) } };
    }),
}));

const NO_IDS: string[] = [];

function useDeckSortedByRank(deck: string): string[] {
    const ids = useCards((state) => state.idsByDeck[deck] ?? NO_IDS);
    const ranks = useCards(useShallow((state) => ids.map((id) => state.byId[id]?.rank ?? 0)));
    return useMemo(
        () => ids.map((id, i) => ({ id, rank: ranks[i] })).sort((a, b) => a.rank - b.rank).map((entry) => entry.id),
        [ids, ranks],
    );
}

function Deck({ deck }: { deck: string }) {
    const ids = useDeckSortedByRank(deck);
    return <>{ids.map((id) => <CardTitle key={id} id={id} />)}</>;
}

function CardTitle({ id }: { id: string }) {
    const title = useCards((state) => state.byId[id]?.title);
    return <div>{title}</div>;
}

const cards = useCards.getState();
cards.upsertMany([
    { id: 'c1', deck: 'red', title: 'Ace', rank: 1 },
    { id: 'c2', deck: 'red', title: 'King', rank: 2 },
    { id: 'c3', deck: 'red', title: 'Queen', rank: 3 },
]);
cards.update('c1', { title: 'Ace of hearts' });
cards.update('c2', { deck: 'black' });
cards.remove('c3');
```

What this code does by hand:

1. It maintains the index. `idsByDeck` is updated in all three actions that can
   change a deck; miss one and the deck shows a card that has left it.
2. It maintains the order. The deck subscribes to its cards' ranks through a
   shallow-compared selector and sorts in a `useMemo`, and each sort starts from
   scratch over the whole deck.
3. Every write copies the table. `{ ...state.byId }` copies every entry, because
   the store detects change by reference.
4. Every write wakes every subscriber. zustand calls every listener on every
   `set`, so each mounted `CardTitle` runs its selector and each `Deck` runs two,
   plus the shallow compare over its ranks, only to find nothing changed.
5. Batching exists only where someone wrote it. `upsertMany` is one such action;
   any other bulk path is another action to write.
6. Selector results have to be kept stable by hand. `NO_IDS` and `useShallow` are
   there because a selector that returns a new array re-renders on every write.
7. Memory is split between two owners. The sorted order lives in a `useMemo` and
   goes with the component, while `idsByDeck` keeps an entry for every deck ever
   written.

### alien-signals

A signal library removes the table copy and the wake-everyone problem: each field
is a signal and only its readers re-run. The collection layer and the React binding
are still yours to write.

```tsx
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { computed, effect, endBatch, signal, startBatch, trigger } from 'alien-signals';

type Card = { id: string; deck: string; title: string; rank: number };

type CardSignals = {
    id: string;
    deck: ReturnType<typeof signal<string>>;
    title: ReturnType<typeof signal<string>>;
    rank: ReturnType<typeof signal<number>>;
};

type DeckSignal = ReturnType<typeof signal<CardSignals[]>>;

const cards = new Map<string, CardSignals>();
const decks = new Map<string, DeckSignal>();
const sortedDecks = new Map<string, { sorted: () => CardSignals[]; users: number }>();

const inBatch = (run: () => void): void => {
    startBatch();
    try {
        run();
    } finally {
        endBatch();
    }
};

const deckOf = (deck: string): DeckSignal => {
    let members = decks.get(deck);
    if (members === undefined) {
        members = signal<CardSignals[]>([]);
        decks.set(deck, members);
    }
    return members;
};

const leave = (card: CardSignals): DeckSignal => {
    const left = deckOf(card.deck());
    left().splice(left().indexOf(card), 1);
    return left;
};

export function update(id: string, patch: Partial<Card>): void {
    const held = cards.get(id);
    if (held === undefined) return;
    inBatch(() => {
        if (patch.title !== undefined) held.title(patch.title);
        if (patch.rank !== undefined) held.rank(patch.rank);
        if (patch.deck === undefined || patch.deck === held.deck()) return;
        const left = leave(held);
        held.deck(patch.deck);
        const joined = deckOf(patch.deck);
        joined().push(held);
        trigger(() => { left(); joined(); });
    });
}

export function upsertMany(incoming: readonly Card[]): void {
    inBatch(() => {
        for (const card of incoming) {
            if (cards.has(card.id)) {
                update(card.id, card);
                continue;
            }
            const created = { id: card.id, deck: signal(card.deck), title: signal(card.title), rank: signal(card.rank) };
            cards.set(card.id, created);
            const joined = deckOf(card.deck);
            joined().push(created);
            trigger(() => { joined(); });
        }
    });
}

export function remove(id: string): void {
    const held = cards.get(id);
    if (held === undefined) return;
    cards.delete(id);
    const left = leave(held);
    trigger(() => { left(); });
}

const sortedDeckOf = (deck: string): (() => CardSignals[]) => {
    let entry = sortedDecks.get(deck);
    if (entry === undefined) {
        entry = { sorted: computed(() => [...deckOf(deck)()].sort((a, b) => a.rank() - b.rank())), users: 0 };
        sortedDecks.set(deck, entry);
    }
    return entry.sorted;
};

function useSignalValue<TValue>(read: () => TValue): TValue {
    const store = useMemo(() => {
        let value = read();
        return {
            subscribe: (onChange: () => void) => effect(() => { value = read(); onChange(); }),
            get: () => value,
        };
    }, [read]);
    return useSyncExternalStore(store.subscribe, store.get, store.get);
}

function useDeckSortedByRank(deck: string): CardSignals[] {
    const sorted = useMemo(() => sortedDeckOf(deck), [deck]);
    useEffect(() => {
        const entry = sortedDecks.get(deck);
        if (entry !== undefined) entry.users++;
        return () => {
            const held = sortedDecks.get(deck);
            if (held !== undefined && --held.users === 0) sortedDecks.delete(deck);
        };
    }, [deck]);
    return useSignalValue(sorted);
}

function Deck({ deck }: { deck: string }) {
    const members = useDeckSortedByRank(deck);
    return <>{members.map((card) => <CardTitle key={card.id} card={card} />)}</>;
}

function CardTitle({ card }: { card: CardSignals }) {
    const title = useSignalValue(useMemo(() => () => card.title(), [card]));
    return <div>{title}</div>;
}

upsertMany([
    { id: 'c1', deck: 'red', title: 'Ace', rank: 1 },
    { id: 'c2', deck: 'red', title: 'King', rank: 2 },
    { id: 'c3', deck: 'red', title: 'Queen', rank: 3 },
]);
update('c1', { title: 'Ace of hearts' });
update('c2', { deck: 'black' });
remove('c3');
```

The index (`decks`) is still kept in step by hand in `update`, `upsertMany` and
`remove`. A list mutated in place needs a `trigger` after every `push` and
`splice`, and every write path needs `inBatch` around it. React needs its own
binding: `useSignalValue` builds a store over `effect` for `useSyncExternalStore`.
Freeing the sorted order takes reference counting in `useDeckSortedByRank`,
because a `computed` lives as long as the map entry that holds it. And the sort
still runs from scratch over the whole deck whenever membership or any member's
rank moves.

`remove` also shows the keyed-family problem from the previous section: `c3`
leaves the map, but anything that still holds its `CardSignals` keeps reading it
and is never told.

### OIMDB

```tsx
import {
    OIMDB,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMIndexService,
} from '@oimdb/core';
import {
    OIMDBProvider,
    useOIMComputedValue,
    useOIMEntity,
    useOIMSlotsByKeys,
} from '@oimdb/react';

type Card = { id: string; deck: string; title: string; rank: number };

const db = new OIMDB();
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);

const cardsByDeckService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const cardsByRankService = createOIMComputedServiceSorted({
    indexService: cardsByDeckService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const cardsByRank = cardsByRankService.createSortedStoreSlot(cardsByDeck);

function Deck({ deck }: { deck: string }) {
    const [sorted] = useOIMSlotsByKeys(cardsByRankService.computedCollectionService, cardsByRank, [deck]);
    const slots = useOIMComputedValue(sorted);
    const ids = slots.flatMap((slot) => (slot.entity === undefined ? [] : [slot.entity.id]));
    return <>{ids.map((id) => <CardTitle key={id} id={id} />)}</>;
}

function CardTitle({ id }: { id: string }) {
    const card = useOIMEntity(cardService, cards, id);
    return <div>{card?.title}</div>;
}

export function App() {
    return (
        <OIMDBProvider db={db}>
            <Deck deck="red" />
        </OIMDBProvider>
    );
}

const cardContentService = cardService.slotContentService;
cardContentService.upsertEntities(cards, [
    { id: 'c1', deck: 'red', title: 'Ace', rank: 1 },
    { id: 'c2', deck: 'red', title: 'King', rank: 2 },
    { id: 'c3', deck: 'red', title: 'Queen', rank: 3 },
]);
db.flush();

cardContentService.updateEntity(cardService.getSlotByKey(cards, 'c1'), { title: 'Ace of hearts' });
db.flush();

cardContentService.updateEntity(cardService.getSlotByKey(cards, 'c2'), { deck: 'black' });
db.flush();

cardContentService.deleteEntity(cardService.getSlotByKey(cards, 'c3'));
db.flush();
```

The components sit under `<OIMDBProvider>` because every subscription is an effect on that db's
channel slot. `useOIMSlotsByKeys` holds the sorted derivation for `deck` while `Deck` is mounted,
and `useOIMComputedValue` subscribes to it and reads it through its value service
(`computedValueService.getValueForSlot`). Taking the six steps in turn:

1. `upsertEntities` is one subframe: every entity lands, and then the **frame**
   (the delivery of every write since the previous one, see the
   [glossary](/docs/core/model#glossary)) delivers once.
2. The order is a derivation over the index. Its sources are the deck's bucket
   slot and the deck's `rank` bucket column slot, so it re-sorts only when the
   deck's membership changes or a write changes `rank` on one of its cards. A
   re-sort starts from a copy of the previous order, drops the members that left
   and appends the arrivals before sorting.
3. The title edit wakes only the `CardTitle` of `c1`. Neither the bucket nor the
   `rank` column moved, so `Deck` is not woken, nothing is sorted, and no selector
   runs anywhere.
4. The move is a write to the card. The index files `c2` out of the red bucket and
   into the black one, and the red `Deck` and the `CardTitle` of `c2` wake.
5. The removal takes the value away, the index drops `c3` from the red bucket,
   and the red `Deck` wakes.
6. When `Deck` unmounts, its sorted derivation goes at the last unhold, and its
   hold on the index bucket goes with it. Entity slots follow the release policy
   the collection was built with. Without a `slotReleasePolicy` option that is
   `OIMSlotReleasePolicyAtEmpty`: an empty slot goes once nothing holds it, and a
   slot with content stays until it is cleared. To drop content nobody watches,
   pass another policy (`OIMSlotReleasePolicyAfterIdle`,
   `OIMSlotReleasePolicyAtUnhold`, …). See
   [Releasing an identity](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).

How each version compares in time, task by task, is on the
[results](/docs/benchmarks/results) page.

## Why the architecture looks like this

A lookup by key has a cost. A store that answers every read through a `Map` or a
dictionary pays it on every read, every write and every subscription check, and a
store that asks every subscriber "did you change?" pays a call per subscriber per
write. OIMDB resolves a key to a slot once, and from then on reads, writes and
subscriptions go through the slot. With the map-driven store, minting a slot
allocates the slot object and then does the same map write a plain store would.
The bet is that this price is repaid because whatever is created has a consumer
on a page.

Subscribers hang on slots, so a write schedules only the effects filed on the
slots it changed, and no subscriber is asked whether it changed. An index files an
entity into its bucket at write time, because which bucket it belongs to is a fact
about the write. A sorted view derives its order when it is read, because only a
reader needs the order. [Why an index looks like this](/docs/core/index-shape)
walks through that split.

Every point in the zustand list above is also a decision with more than one
defensible answer: copy an entity on write or change it in place, keep a bucket as
a set or as an ordered array, free what nobody shows at once, after a delay or
never, keep an order sorted on write or derive it on read. Code written by hand
settles each of these once, often without noticing, and changing it later means
rewriting the layer. OIMDB ships both answers as strategies and you pick one when
you construct the service: the writer, the bucket shape, the release policy, and
sort at read or at write. The hot path then has no branch on the choice. The full
list is in
[Where a strategy is picked at construction](/docs/core/architecture#where-a-strategy-is-picked-at-construction).

## The trade

The work moves to the moment an entity is created. An insert does more than a map
write: it mints a slot, and under an index it also files the slot into a bucket.
An update through a held slot does no lookup and wakes only the effects on what it
changed.

That does not make every update cheaper than every insert. In the current
measurements both kinds of task have cases at or below hand-written code and cases
above it. The [results](/docs/benchmarks/results) show where each task lands
against hand-written code and every library in the benchmark.

## OIMDB and signal libraries

Both are reactive graphs over values. They differ in four architectural choices
about where the work happens and how stale state is detected, and each choice
helps some tasks and hurts others.

### A revision clock instead of dirty marks

On every write, a signal library walks down the graph marking each dependent node
dirty, then recomputes lazily when a node is read. OIMDB marks nothing below the
written slot: the write stamps that one slot with a revision of a global clock,
and a derived node, when read, compares its own revision with its sources'. A
write therefore costs the same however much is derived from the slot, and repeated
writes to one slot within a frame are one stamp each. The price is a revision
comparison per source on every derived read.

### A graph folded at subscription instead of linked lazily

An OIMDB effect resolves its sources down to their root slots when it is created
and files itself directly on those roots, so a write reaches the effect in one
step and never walks the nodes in between. A signal library links lazily as the
effect's first run reads, which makes subscribing cheap and makes every write walk
the links level by level. OIMDB's standing graph is the cheaper one to run;
building and tearing down a subscription is the more expensive one, and an
application that mounts and unmounts many short-lived derivations pays that on
every mount.

### Declared or tracked dependencies

A signal library learns an effect's dependencies from what it reads. A conditional
dependency such as `flag ? a : b` subscribes exactly to the branch taken, at no
effort from the author, and the price is tracking work on every read inside a
running effect. An OIMDB effect created with declared sources pays nothing per
read beyond the read itself, but a conditional dependency subscribes to both
branches, so a write to the inactive one still wakes the effect. OIMDB offers both
models per effect: `effectService.createEffectWithSourceTracking(body)` learns its
sources from what the body reads through the tracker, as a signal library does,
and pays the tracking cost on each read.

### Delivery per frame instead of per write

Every write in OIMDB lands in the channel, and effects run once at `db.flush()`,
which is the commit point of a turn (with [cnstra](https://cnstra.org/) that is one
`addDrainListener` call). A signal library runs an effect after each write unless
the writes are wrapped in a batch. In OIMDB many writes in one turn deliver once
without a batch to remember; in exchange nothing is delivered until the flush, so a
consumer that needs a value after every single write has to flush after every
write.

### What a signal library gives that OIMDB does not

A signal library ships the reactive graph and nothing else, so its bundle is
smaller. OIMDB also ships slots, collections, indexes, sorted views, release
policies and the channel, and an application that uses none of them carries their
weight for nothing (see [Bundle size](#bundle-size)).

Its model is also simpler: a value, the functions that read it, and they re-run
when it changes. With OIMDB you learn slots and their lifetime, services and their
store slots, holds, the frame and `flush()`, and which strategy each service was
built with, before the first screen works.

### Choosing between them

A small, fixed graph of global values, or many short-lived derivations that mount
and unmount constantly, favours the signal library and its cheap subscription.
Standing screens with many readers, several writes per turn and effects that read
many values favour OIMDB, which did its graph work at subscription time. For
conditional dependencies that switch often, a signal library tracks them exactly,
and so does an OIMDB effect created with source tracking; a declared OIMDB effect
over-subscribes.

## Bundle size

OIMDB is heavier than a bare store, because it contains the collection layer you
would otherwise write yourself. What `@oimdb/core` adds to a bundle, minified and
tree-shaken:

{/* bundle-size:begin */}
| Consumer | Minified | Minified + gzip |
|---|---:|---:|
| Everything `@oimdb/core` exports | 103361 B | 25288 B |
| One entity store slot: `OIMDB`, `createOIMEntityService`, `upsertEntity`, `getSlotByKey` | 41485 B | 10710 B |
| The same, plus one effect and `db.flush()` | 50131 B | 12876 B |
| The same, plus one index: `createOIMIndexService` | 71765 B | 17728 B |
| An ordered bucket with commands: `createOIMBucketService`, `OIMSlotContentBucketServiceArrayDriven`, `OIMBucketCommands` | 56072 B | 13880 B |
{/* bundle-size:end */}

## Next steps

<DocCards>
<DocCard to="/docs/core/model" title="The model">Slots, the doors that mint them, and the frame.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Slot lists whose slots the caller states.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">Buckets filled from a source collection by a key function.</DocCard>
<DocCard to="/docs/guides/performance" title="Performance">What the engine costs and how to keep it low.</DocCard>
<DocCard to="/docs/benchmarks" title="Benchmarks">How the cells are defined, run and compared.</DocCard>
</DocCards>
