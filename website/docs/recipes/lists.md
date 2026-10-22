---
sidebar_position: 2
title: Lists
description: Build lists as buckets, covering grouping by a field, sorted and filtered groups, server-ordered pages, selections, drag reorder and per-group sums.
---

# Lists

Every list in OIMDB is a bucket: a slot whose content is other slots. This page
covers these list tasks: grouping by a field, a sorted group, a whole entity store slot as
one list, a filtered list, a page or an infinite list in server order, search results,
a selection, drag-and-drop reordering, a count or a sum per group, and minting several
groups in one call.

```ts setup
import {
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotReleasePolicyAtUnhold,
    createOIMBucketService,
    createOIMComputedServiceBucketMemo,
    createOIMComputedService,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMIndexService,
    createOIMSingleBucketService,
    oimSameValueZeroGuard,
    type TOIMBucketSlotsSetStore,
    type TOIMEntitySlot,
    type TOIMOrderedListCommand,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = {
    id: string;
    deck: string;
    title: string;
    rank: number;
    points: number;
    archived: boolean;
};

declare function render(value?: unknown): void;
declare function rebuildFrom(slots: Iterable<TOIMEntitySlot<Card>>): void;
declare function applyToTheRenderedList(commands: readonly TOIMOrderedListCommand[]): void;

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const cardContentService = cardService.slotContentService;

function createSetBucketService() {
    return createOIMBucketService<
        TOIMEntitySlot<Card>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<Card>>,
        OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>() });
}
```

## Group entities by a field

Take: `createOIMIndexService` with a `keyOf` that returns the field, and its
`createIndexStoreSlot(cards)` for the index store slot. Its buckets keep arrival order and read by position;
pass `slotContentService: new OIMSlotContentBucketServiceSetDriven()` when you need neither. Do not take a
manual bucket collection here: it never looks at the entity, so it cannot follow a card that moves to another
deck.

```ts
const cardsByDeckService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);

const red = cardsByDeckService.holdSlotByKey(cardsByDeck, 'red');
const onRed = effectService.createEffectImmediate(db, [red], [], () => {
    for (const cardSlot of cardsByDeckService.slotContentService.getBucketMemberSlots(red)) render(cardSlot.entity);
});

const ace = cardContentService.upsertEntity(cards, { id: 'c1', deck: 'red', title: 'Ace', rank: 1, points: 11, archived: false });
cardContentService.updateEntity(ace, { deck: 'blue' });
db.flush();

effectService.disposeEffect(onRed);
red.owner.unholdSlot(red);
```

Why this way: an index is pushed to. Every write to `cards` reaches it through
the store slot's content-change listener, and per entity it does one `keyOf` and one read
of the key it filed the entity under before. Only when the two differ does it edit
buckets, so the cost of a write does not depend on how many cards or decks exist. The
bucket slot is written on membership changes only: a title edit on a red card wakes
that card's own subscribers and not the list. The set-driven content service makes membership
tests and removals a hash lookup. The array-driven one keeps the order cards arrived
in, and is the only one with `getBucketMemberSlotAt` and
`getBucketMemberSlotPosition`: a set has no positions to read. Left without a policy, an unheld
bucket stays while it has members (`OIMSlotReleasePolicyAtEmpty`).

Reference: [Indexes](/docs/core/oimindex),
[How a bucket holds its slots](/docs/core/indexes#how-a-bucket-holds-its-slots-the-content-services),
[Why an index looks like this](/docs/core/index-shape).

## A sorted list per group

Take: `createOIMComputedServiceSorted` over an index service, with `sortColumns` naming the
columns the order depends on, and its `createSortedStoreSlot(indexStoreSlot)`. Add `comparator` when the order is not a plain column
comparison. Do not sort inside an effect on the bucket: it re-sorts on every wake,
including the ones where no sort column moved.

```ts
const cardsByDeckService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);

const byRankService = createOIMComputedServiceSorted({
    indexService: cardsByDeckService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const byRank = byRankService.createSortedStoreSlot(cardsByDeck);

const byTitleService = createOIMComputedServiceSorted({
    indexService: cardsByDeckService,
    sortColumns: [{ column: 'title', direction: 'asc' }],
    comparator: (left: Card, right: Card) => left.title.localeCompare(right.title),
});
const byTitle = byTitleService.createSortedStoreSlot(cardsByDeck);

const redByRank = byRankService.computedCollectionService.holdSlotByKey(byRank, 'red');
effectService.createEffectImmediate(db, [], [redByRank], () => render(redByRank.computedValueService.getValueForSlot(redByRank)));

const redByTitle = byTitleService.computedCollectionService.getSlotByKey(byTitle, 'red');
redByTitle.computedValueService.getValueForSlot(redByTitle);
```

Why this way: an index files membership when the write happens, and the sorted view
derives the order when it is read. The sorted computed's sources
are the bucket slot of the key plus one bucket column slot per named column, so it
derives again only when a card joined or left the deck or a write changed `rank` on a
member; a title edit moves none of its sources. `sortColumns` says when to sort and
`comparator` says how. Given a comparator alone, the engine cannot see which columns
it reads, so its sources become the bucket slot and the bucket's any-column slot
(`getAnyBucketColumnByKey`, which wakes on member content only; a join or leave wakes the bucket slot)
and any write to a member re-sorts. A re-sort that yields the same sequence keeps the previous array, so a
consumer comparing by identity sees no change. Read the value through
`slot.computedValueService.getValueForSlot(slot)`: outside an effect body the slot's own value field
is whatever the last read left there.

Reference: [Ordering](/docs/core/oimindex#ordering),
[The order of a bucket is a derivation](/docs/core/computed-effects#the-order-of-a-bucket-is-a-derivation).

## A list that is a whole entity store slot

Take: an index whose `keyOf` returns one constant. Do not iterate the entity
store slot's `getSlots` for a list: nothing tells you when that iteration would read
differently, and it can include slots that were minted by a read and hold no entity.

```ts
const everyCardService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: () => 'all',
});
const everyCard = everyCardService.createIndexStoreSlot(cards);

const all = everyCardService.holdSlotByKey(everyCard, 'all');
effectService.createEffectImmediate(db, [all], [], () => render(everyCardService.slotContentService.getBucketMemberSlotCount(all)));

const allByRankService = createOIMComputedServiceSorted({
    indexService: everyCardService,
    sortColumns: [{ column: 'rank', direction: 'desc' }],
});
const allByRank = allByRankService.createSortedStoreSlot(everyCard);
const allByRankSlot = allByRankService.computedCollectionService.getSlotByKey(allByRank, 'all');
allByRankSlot.computedValueService.getValueForSlot(allByRankSlot);
```

Why this way: a constant key is one bucket that every entity is filed into on
arrival and taken out of when its entity is gone (a slot with no entity is filed
under no bucket). The bucket slot is the thing to subscribe to for "a card arrived or
left", and it is also a valid source for a sorted view, a count or any other
computed over the whole store slot.

Reference: [Indexes](/docs/core/oimindex),
[The order of a bucket is a derivation](/docs/core/computed-effects#the-order-of-a-bucket-is-a-derivation).

## A filtered list

Take: an index whose `keyOf` returns the filter's value, and hold only the bucket
of the value you show. For several criteria, return one composite key. Do not write the
filter as a computed that scans the store slot: a computed learns that something
changed, never what, so it would rescan every card on every write.

```ts
const cardsByStatusService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => (card.archived ? 'archived' : 'active'),
});
const cardsByStatus = cardsByStatusService.createIndexStoreSlot(cards);
const active = cardsByStatusService.holdSlotByKey(cardsByStatus, 'active');
effectService.createEffectImmediate(db, [active], [], () => render(cardsByStatusService.getEntitiesByKey(cardsByStatus, 'active')));

const cardsByDeckAndStatusService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => `${card.deck}:${card.archived ? 'archived' : 'active'}`,
});
const cardsByDeckAndStatus = cardsByDeckAndStatusService.createIndexStoreSlot(cards);
const activeRedByRankService = createOIMComputedServiceSorted({
    indexService: cardsByDeckAndStatusService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const activeRedByRank = activeRedByRankService.createSortedStoreSlot(cardsByDeckAndStatus);
const activeRed = activeRedByRankService.computedCollectionService.getSlotByKey(activeRedByRank, 'red:active');
activeRed.computedValueService.getValueForSlot(activeRed);
```

Why this way: a key whose bucket was never minted is not maintained at all. An
archived card costs one `keyOf`, one comparison and, when its key changed, one write
of its index-key cell; no bucket is touched because nobody asked for the archived
bucket. Flipping `archived` on a card moves it out of the active bucket in O(1), since
the card's slot remembers the key it was filed under. `getEntitiesByKey` copies the
entities into a fresh array, which suits a small list; for a long one, iterate
`getBucketMemberSlots` and subscribe each item to its own slot.

Reference: [What a write costs, and how long a bucket lives](/docs/core/oimindex#what-a-write-costs-and-how-long-a-bucket-lives),
[So membership cannot be a computed](/docs/core/index-shape#so-membership-cannot-be-a-computed).

## A page or an infinite list in server order

Take: a manual, array-driven bucket collection, `createOIMBucketService(db)`, and one
store slot of it: the server decides which cards are on the list and in what order, and
the bucket keeps the sequence it is handed. `writeBucketMemberSlots` for the first page or a refresh,
`addBucketMemberSlots` for the next page. Do not take an index: no column of a card can
say "the server did not return this one", and do not take a set-driven bucket: on a
rewrite it keeps the old order of the survivors.

```ts
declare function fetchCardPage(cursor: string | undefined): Promise<{ cards: Card[]; nextCursor: string | undefined }>;

const feedService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const feed = feedService.createStoreSlot(db);
const inbox = feedService.holdSlotByKey(feed, 'inbox');
let nextCursor: string | undefined;

async function loadFirstPage(): Promise<void> {
    const page = await fetchCardPage(undefined);
    feedService.slotContentService.writeBucketMemberSlots(inbox, cardContentService.upsertEntities(cards, page.cards));
    nextCursor = page.nextCursor;
}

async function loadNextPage(): Promise<void> {
    const page = await fetchCardPage(nextCursor);
    feedService.slotContentService.addBucketMemberSlots(inbox, cardContentService.upsertEntities(cards, page.cards));
    nextCursor = page.nextCursor;
}

const feedOrderService = createOIMComputedServiceBucketMemo({
    bucketCollectionService: feedService,
});
const feedOrder = feedOrderService.createBucketMemoStoreSlot(feed);
const inboxOrder = feedOrderService.computedCollectionService.holdSlotByKey(feedOrder, 'inbox');
effectService.createEffectImmediate(db, [], [inboxOrder], () => render(inboxOrder.computedValueService.getValueForSlot(inboxOrder)));
```

Why this way: `upsertEntities` hands back the slots it wrote, in the order of the
response, so the list is built from identities without a second lookup by id.
`writeBucketMemberSlots` is for a caller holding the whole answer: it works out arrivals and
departures, and an unchanged list wakes nobody. `addBucketMemberSlots` is for a caller
holding the delta: the standing slots are not touched and its cost is the page, not
the list; the default content service of `createOIMBucketService` records each arrival as an insert at the
end, which a renderer can append without rebuilding. The default array-driven content service
records one entry per mention, so a card sent on two overlapping pages appears twice;
build it with an `OIMBucketArrayMembershipUnique` when pages can overlap, and a
repeated add is refused. `createOIMComputedServiceBucketMemo` with its
`createBucketMemoStoreSlot(bucketStoreSlot)` turns the bucket into an
array that keeps its identity while the list does not change.

Reference: [A bucket's slots are the caller's](/docs/core/indexes#a-buckets-slots-are-the-callers),
[Writing the whole answer or the delta](/docs/core/indexes#which-door-you-hold-the-answer-or-you-hold-the-delta),
[The order of a bucket is a derivation](/docs/core/computed-effects#the-order-of-a-bucket-is-a-derivation).

## Search results, or one ad-hoc list

Take: a manual bucket store slot with one bucket under a constant key, rewritten
with `writeBucketMemberSlots` on every search; the default array-driven one keeps the ranking the server
returned. When the list has no address at all, a single bucket, `createOIMSingleBucketService(db)` and the store
slot from its `createStoreSlot(db)`, makes a bucket under no key. The store slot mints nothing; its one
bucket slot is minted and read through `getSingleSlot(storeSlot)` or `holdSingleSlot(storeSlot)`, written
with the content service's `writeBucketMemberSlots`, and subscribed to through that slot. It is released like any
bucket once it is empty and nothing holds it, and the next `getSingleSlot` mints a fresh one. Do not keep the
result as a plain array of entities: nothing can subscribe to it, and it goes stale when one of the
cards in it is edited.

```ts
declare function searchCardIds(query: string): Promise<readonly string[]>;

const searchService = createOIMSingleBucketService<TOIMEntitySlot<Card>>(db);
const search = searchService.createStoreSlot(db);
const results = searchService.holdSingleSlot(search);

async function runSearch(query: string): Promise<void> {
    const ids = await searchCardIds(query);
    searchService.slotContentService.writeBucketMemberSlots(results, ids.map((id) => cardService.getSlotByKey(cards, id)));
}

function closeSearch(): void {
    searchService.slotContentService.clearBucketMemberSlots(results);
    results.owner.unholdSlot(results);
}

effectService.createEffectImmediate(db, [results], [], () => rebuildFrom(searchService.slotContentService.getBucketMemberSlots(results)));
```

Why this way: a search result is a fact about the response, not about the
entities, so the caller states it and the engine does not guess. `getSlotByKey` hands
back a slot even for a card that has not been loaded yet; the bucket holds that slot,
and an item subscribed to it renders once the card's entity is written into that same
identity. Every member
of a bucket is held, so `clearBucketMemberSlots` is what gives those holds back when the search
closes. The array-driven content service compares the sequence: the same ids in the same order
change nothing, and a reordered result is drained and re-added whole.

Reference: [A bucket's slots are the caller's](/docs/core/indexes#a-buckets-slots-are-the-callers),
[A single bucket](/docs/core/indexes#a-single-bucket).

## A selection set

Take: a set-driven bucket collection, one bucket per screen that selects.
Toggle with `addBucketMemberSlot` and `removeBucketMemberSlot`, ask with
`hasBucketMemberSlot`. Do not take an array-driven bucket: a selection has no order, and its
membership test scans the list.

```ts
const selectionService = createSetBucketService();
const selections = selectionService.createStoreSlot(db);
const selected = selectionService.holdSlotByKey(selections, 'board');
const selection = selectionService.slotContentService;

function toggleSelected(cardId: string): void {
    const cardSlot = cardService.getSlotByKey(cards, cardId);
    if (selection.hasBucketMemberSlot(selected, cardSlot)) selection.removeBucketMemberSlot(selected, cardSlot);
    else selection.addBucketMemberSlot(selected, cardSlot);
}

effectService.createEffectImmediate(db, [selected], [], () => render(selection.getBucketMemberSlotCount(selected)));

toggleSelected('c1');
toggleSelected('c2');
selection.clearBucketMemberSlots(selected);
```

Why this way: the set-driven content service makes a membership test and a removal a hash
lookup, and adding a slot that is already there changes nothing and wakes nobody. The
selection holds the card slots, not copies of the cards, so an edit to a selected card
is seen through its own slot and does not touch the selection. Bulk selection is one
call: `addBucketMemberSlots` with every slot, or `writeBucketMemberSlots` with the full set.

Reference: [Writing a bucket's slots](/docs/core/indexes#writing-a-buckets-slots),
[How a bucket holds its slots](/docs/core/indexes#how-a-bucket-holds-its-slots-the-content-services).

## Reorder by drag and drop

Take: `createOIMBucketService(db)`: an array-driven bucket collection whose positions
are the caller's, built with a recorder of what each frame's writes did (a frame
is the delivery of every write since the previous one; see the
[glossary](/docs/core/model#glossary)). Use the
position writes: `moveBucketMemberSlotToPosition` inside one list,
`removeBucketMemberSlotAt` and `insertBucketMemberSlotAt` between two. Do not take a
sorted computed with a `rank` column for an order the user decides: the order would
then be a column you compute and write on every drop.

```ts
const boardService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const board = boardService.createStoreSlot(db);
const boardContentService = boardService.slotContentService;
const todo = boardService.holdSlotByKey(board, 'todo');
const done = boardService.holdSlotByKey(board, 'done');

boardContentService.writeBucketMemberSlots(todo, cardContentService.upsertEntities(cards, [
    { id: 'c1', deck: 'todo', title: 'Write', rank: 0, points: 3, archived: false },
    { id: 'c2', deck: 'todo', title: 'Review', rank: 0, points: 1, archived: false },
]));

rebuildFrom(boardContentService.getBucketMemberSlots(todo));
const onTodo = effectService.createEffect(db, [todo], [], () => {
    if (todo.isWholeListRecorded) rebuildFrom(boardContentService.getBucketMemberSlots(todo));
    else applyToTheRenderedList(todo.commands ?? []);
});

boardContentService.moveBucketMemberSlotToPosition(todo, 1, 0);

const dragged = boardContentService.removeBucketMemberSlotAt(todo, 0);
if (dragged !== undefined) boardContentService.insertBucketMemberSlotAt(done, 0, dragged);
db.flush();

effectService.disposeEffect(onTodo);
```

Why this way: a drag handle reports positions, and the position writes take them
as they are: nothing re-decides the order on a read. The recorder writes onto the
bucket slot the commands this frame's writes did (`insert`, `remove`, `move`), so a
renderer moves the existing nodes instead of rebuilding them, and focus, scroll anchors
and animations stay attached. Read `commands` and `isWholeListRecorded` inside the effect
body: they are reset once the flush has ended. `isWholeListRecorded` is set by a write of
the whole list (`writeBucketMemberSlots`, `clearBucketMemberSlots`) and when the script outgrows the list
it describes; a renderer that animates every move
passes `maxCommandsPerSlot: Infinity` to the factory and always gets the script. If the
card's column is also stored on the entity, write it as well; the bucket does not.

Reference: [Positions the caller decides](/docs/core/indexes#positions-the-caller-decides),
[The commands, on the bucket slot](/docs/core/indexes#the-commands-on-the-bucket-slot).

## A count or a sum per group

Take: `createOIMComputedService` keyed by the group, whose sources are the index
bucket of that key, plus the bucket column slot of the summed column for a sum, and
one `createComputedStoreSlot(db)` of it. Read it through the slot's value service,
`slot.computedValueService.getValueForSlot(slot)`. Do not keep a counter of your own updated in an effect: an
effect's result has no slot, so nothing else in the graph can name it as a source.

```ts
const cardsByDeckService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const deckReads = cardsByDeckService.slotContentService;

const cardCountByDeckService = createOIMComputedService<string, number>({
    createSources: (deck: string) => ({ sourceSlots: [cardsByDeckService.getSlotByKey(cardsByDeck, deck)] }),
    derive: (computedSlot) => deckReads.getBucketMemberSlotCount(
        cardsByDeckService.getSlotByKey(cardsByDeck, computedSlot.key),
    ),
    sameValueGuard: oimSameValueZeroGuard,
    initialValue: 0,
});
const cardCountByDeck = cardCountByDeckService.createComputedStoreSlot(db);

const pointsByDeckService = createOIMComputedService<string, number>({
    createSources: (deck: string) => ({
        sourceSlots: [
            cardsByDeckService.getSlotByKey(cardsByDeck, deck),
            cardsByDeckService.getBucketColumnByKey(cardsByDeck, deck, 'points'),
        ],
    }),
    derive: (computedSlot) => {
        let total = 0;
        for (const cardSlot of deckReads.getBucketMemberSlots(
            cardsByDeckService.getSlotByKey(cardsByDeck, computedSlot.key),
        )) {
            total += cardSlot.entity?.points ?? 0;
        }
        return total;
    },
    sameValueGuard: oimSameValueZeroGuard,
    initialValue: 0,
});
const pointsByDeck = pointsByDeckService.createComputedStoreSlot(db);

const redPoints = pointsByDeckService.computedCollectionService.holdSlotByKey(pointsByDeck, 'red');
effectService.createEffectImmediate(db, [], [redPoints], () => render(redPoints.computedValueService.getValueForSlot(redPoints)));
const redCount = cardCountByDeckService.computedCollectionService.getSlotByKey(cardCountByDeck, 'red');
redCount.computedValueService.getValueForSlot(redCount);
```

Why this way: a computed is pulled. It derives on the read that asks, at most once
per clock tick, and only when one of its sources moved since its last run. The bucket
slot moves on membership, and the bucket column slot moves when a write changes
`points` on a member, so a title edit derives neither total. The index marks bucket
column slots only after one has been asked for, so a deck nobody sums pays nothing for
them. A computed's `sameValueGuard` decides whether a re-derived total counts as
unchanged, and an unchanged total wakes nothing above it; with none given the guard is
`Object.is`, and `oimSameValueZeroGuard` also treats `NaN` as equal to `NaN`. A
computed's default release policy is `OIMSlotReleasePolicyAtUnhold`: a slot only read
goes at the next flush, a held one at its last unhold, and its holds on the bucket go
with it.

Reference: [One derivation per key](/docs/core/computed-effects#one-derivation-per-key),
[Ordering](/docs/core/oimindex#ordering) (bucket column slots),
[Releasing a computed and its sources](/docs/core/computed-effects#releasing-a-computed-and-its-sources).

## Several groups fetched at once

Take: `holdSlotsByKeys` on the index (or `getSlotsByKeys` for a read inside this
turn) with every key the screen shows. Do not call `holdSlotByKey` once per key in a
loop: each new bucket is filled by its own scan of the source store slot.

```ts
const cardsByColumnService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
    slotReleasePolicy: OIMSlotReleasePolicyAtUnhold.INSTANCE,
});
const cardsByColumn = cardsByColumnService.createIndexStoreSlot(cards);

const columns = cardsByColumnService.holdSlotsByKeys(cardsByColumn, ['todo', 'doing', 'done']);
const onColumns = effectService.createEffectImmediate(db, columns, [], () => {
    for (const column of columns) render(cardsByColumnService.slotContentService.getBucketMemberSlotCount(column));
});

effectService.disposeEffect(onColumns);
for (const column of columns) column.owner.unholdSlot(column);
```

Why this way: a bucket minted after its entities were written is filled from the
source when it is minted, and that fill is the only scan an index ever does. Minting
several keys in one call fills all the new buckets in one pass over the source instead
of one pass per key. The slots come back in the order of the keys you passed. With
`OIMSlotReleasePolicyAtUnhold` each column goes at its last unhold, and the next hold
builds it again with one scan; leave the policy out when the same columns are opened
over and over.

Reference: [Indexes](/docs/core/oimindex),
[Membership is a bucket, and it is pushed](/docs/core/index-shape#membership-is-a-bucket-and-it-is-pushed).
