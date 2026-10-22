---
sidebar_position: 3
title: Reacting to changes
description: Run code when an entity or field changes, derive values, batch writes into one delivery, flush automatically, clean up effects and route their errors.
---

# Reacting to changes

Running code when data moves: an effect on one entity or one field, a derived
value, batching many writes into one delivery, flushing on a microtask or an
animation frame, writing in response to a change, cleaning up after an effect
body, routing errors, and listing what changed in a frame. A frame is the
delivery of every write made since the previous one (see the
[glossary](/docs/core/model#glossary)).

```ts setup
import { OIMChannelService, OIMDB, OIMEffectService, createOIMEntityService, type TOIMStoreKey } from '@oimdb/core';

type Card = { id: string; deckId: string; title: string; rank: number };

declare function render(value: unknown): void;

const db = new OIMDB();
const channelSlot = db.defaultChannelSlot;
const channelService = OIMChannelService.INSTANCE;
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const cardContentService = cardService.slotContentService;
```

## Run code when one entity changes

Take: `effectService.createEffectImmediate(db, sourceSlots, sourceComputeds, body)` for "now, then
on every change", or `effectService.createEffect` for "on every change from now on"; keep the
`TOIMEffect` and call `effectService.disposeEffect(effect)` when you are done (or take `subscribeEffect`, which
hands back the disposer). A polling loop or a re-read on a timer has nothing to add, because the slot already
knows when it moved.

```ts
const aceSlot = cardService.getSlotByKey(cards, 'c1');

const aceEffect = effectService.createEffectImmediate(db, [aceSlot], [], () => {
    render(aceSlot.entity?.title);
});

cardContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'Ace', rank: 1 });
db.flush();

effectService.disposeEffect(aceEffect);
```

Why this way: an effect is filed on the slot's own `effects` list, so a
write finds the body without a lookup, and the effect holds every slot it reads
until `disposeEffect` — the slot read with `getSlotByKey` stays filed past the next
flush because the effect holds it. `createEffect` is told only about writes made after
it was built; `createEffectImmediate` runs the body once at construction, and if that
run throws it disposes the effect and rethrows. The sources are the slots the two
lists name: a slot the body reads but the lists do not name does not wake it.

Reference: [Subscribing is building an effect](/docs/core/reading-subscribing#subscribing-is-building-an-effect),
[Effects](/docs/core/computed-effects#effects).

## React only to one field

Take: `cardService.holdColumn(slot, columnName)` for the column slot, and
`effectService.createEffect(db, [columnSlot], [], body)` over it; give both back with
`effectService.disposeEffect(effect)` and `cardService.unholdColumn(columnSlot)`.
`effectService.createEffect(db, [slot], [], …)` on a wide entity that is written often
runs its body on every column.

```ts
const kingSlot = cardContentService.upsertEntity(cards, { id: 'k', deckId: 'hearts', title: 'King', rank: 13 });

const rankColumn = cardService.holdColumn(kingSlot, 'rank');
const rankEffect = effectService.createEffect(db, [rankColumn], [], () => {
    render(kingSlot.entity?.rank);
});

cardContentService.updateEntity(kingSlot, { title: 'King of hearts' });
cardContentService.updateEntity(kingSlot, { rank: 12 });
db.flush();

effectService.disposeEffect(rankEffect);
cardService.unholdColumn(rankColumn);
```

Why this way: a column slot is its own identity, filed under its carrier
slot, and a write marks only the column slots of the columns it changed — the
title update above does not wake the body. The column slot holds no value; what
moved is read from the entity slot you already have. The column name is checked
against the collection's column-name type: `createOIMEntityService` sets it to
`TOIMEntityColumnName<TEntity>`, so a misspelt name does not compile. While the carrier has a column slot, the
carrier is kept.

Reference: [Subscribing to one column](/docs/core/reading-subscribing#subscribing-to-one-column).

## A derived value

Take: `createOIMComputedService<void, V, …>` with `OIMSlotStoreServiceSingleSlotDriven.INSTANCE` as
its `computedSlotStoreService`, and its `createComputedStoreSlot(db, derive, createSources)`, for one value
with no key; `createOIMComputedService<K, V>` and its `createComputedStoreSlot(db)` for one value per key.
Both are read through `computedCollectionService`, the single one with the key `undefined`, and the value through
the slot — `slot.computedValueService.getValueForSlot(slot)`. Outside an effect body,
`computedSlot.value` is whatever the last read left there and settles nothing.

```ts
import {
    OIMSlotStoreServiceSingleSlotDriven,
    createOIMComputedService,
    createOIMIndexService,
    type TOIMComputedSlot,
    type TOIMSingleSlotStore,
} from '@oimdb/core';

const cardsByDeckService = createOIMIndexService(db, { entityService: cardService, keyOf: (card: Card) => card.deckId });
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const spades = cardsByDeckService.holdSlotByKey(cardsByDeck, 'spades');

const spadesCountService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    initialValue: 0,
    computedSlotStoreService:
        OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
});
const spadesCount = spadesCountService.createComputedStoreSlot(
    db,
    () => cardsByDeckService.slotContentService.getBucketMemberSlotCount(spades),
    () => ({ sourceSlots: [spades] }),
);

const spadesCountSlot = spadesCountService.computedCollectionService.holdSlotByKey(spadesCount, undefined);
const countEffect = effectService.createEffectImmediate(db, [], [spadesCountSlot], () => {
    render(spadesCountSlot.computedValueService.getValueForSlot(spadesCountSlot));
});

const cardLabelService = createOIMComputedService<TOIMStoreKey, string>({
    createSources: (id: TOIMStoreKey) => ({ sourceSlots: [cardService.getSlotByKey(cards, id)] }),
    derive: (computedSlot) => {
        const card = cardService.getSlotByKey(cards, computedSlot.key).entity;
        return card === undefined ? '' : `${card.title} #${card.rank}`;
    },
    initialValue: '',
});
const cardLabels = cardLabelService.createComputedStoreSlot(db);

const aceLabel = cardLabelService.computedCollectionService.getSlotByKey(cardLabels, 'c1');
render(aceLabel.computedValueService.getValueForSlot(aceLabel));

effectService.disposeEffect(countEffect);
spadesCountSlot.owner.unholdSlot(spadesCountSlot);
spades.owner.unholdSlot(spades);
```

Why this way: a computed is pulled. A write marks only root
slots; an effect that names a computed is filed on every root under it and,
before running, asks the computed, which re-derives only if one of its sources
moved. A re-derived value that the computed's `sameValueGuard` calls equal to the
previous one (`Object.is` when none is given) keeps the effect asleep. The
service and its store slot hold nothing; the computed slot minted through them holds its sources, and under
the computed default `OIMSlotReleasePolicyAtUnhold` it goes at its last unhold, or
at the next flush when it was only read. Keep the service and the store slot; the next read mints a
fresh slot. In `createSources`, resolve with `getSlotByKey`, not `holdSlotByKey`:
the computed slot takes and gives back its own holds on the sources.

Reference: [The compute graph](/docs/core/computed-effects),
[One derivation per key](/docs/core/computed-effects#one-derivation-per-key).

## Many writes, one delivery

Take: nothing extra — write, then let one flush deliver. Open a subframe with
`openSubframe(channelSlot)` / `closeSubframe(channelSlot)` only when several writes must
count as one change even if something between them asks for a frame. A flush per
write defeats the batching.

```ts
let runs = 0;
const jack = cardContentService.upsertEntity(cards, { id: 'j', deckId: 'clubs', title: 'Jack', rank: 11 });
const jackEffect = effectService.createEffect(db, [jack], [], () => { runs++; });

cardContentService.updateEntity(jack, { title: 'Jack of clubs' });
cardContentService.updateEntity(jack, { rank: 10 });
db.flush();

channelService.openSubframe(channelSlot);
try {
    cardContentService.updateEntity(jack, { rank: 11 });
    cardContentService.upsertEntity(cards, { id: 't', deckId: 'clubs', title: 'Ten', rank: 10 });
} finally {
    channelService.closeSubframe(channelSlot);
}
db.flush();

effectService.disposeEffect(jackEffect);
```

Why this way: a frame is one delivery — every effect whose sources moved runs
once, however many writes touched them. Above, two updates and one flush run the body once.
A subframe is a counter for one logical change: while it is open the frame cannot
close — a frame asked for is owed by the `closeSubframe` that brings the count to
zero, and `flush()` inside it throws. Batch writes such as `upsertEntities` open a
subframe of their own.

Reference: [The frame](/docs/core/channel#the-frame),
[The subframe](/docs/core/channel#the-subframe).

## Flush automatically

Take: a `channelScheduler` in the `OIMDB` options —
`(flush) => { void Promise.resolve().then(flush); }` for one frame per event-loop
turn, or `requestAnimationFrame` for one frame per paint. Leave it out in tests
and on a server, and call `db.flush()` yourself.

```ts
const appDb = new OIMDB({
    channelScheduler: (flush) => { void Promise.resolve().then(flush); },
});

const paintedDb = new OIMDB({
    channelScheduler: (flush) => { requestAnimationFrame(() => { flush(); }); },
});

const testDb = new OIMDB();
testDb.flush();
```

Why this way: without a scheduler nothing is ever delivered until `flush()`
is called. The scheduler is called once when the first write of a batch needs a
frame and not again until that frame has run, so it decides how long a burst is.
It returns no handle, so a requested frame cannot be recalled; a manual `flush()`
before it arrives leaves the scheduled call nothing to do. A write that no effect
watches asks for no frame, unless an after-each-frame handler is registered.

Reference: [Schedulers](/docs/core/channel#schedulers).

## Write in response to a change

Take: `subscribeAfterEachFlush(channelSlot, handler)` for the write, with the effect
recording what to do; or hand the write to a microtask from the effect. A
write from the effect body, from `onBeforeFlush` or from an after-each-frame
handler throws: writes are refused for the whole of a flush.

```ts
const toArchive = new Set<TOIMStoreKey>();
const queen = cardService.getSlotByKey(cards, 'q');

const queenEffect = effectService.createEffect(db, [queen], [], () => {
    if (queen.entity?.rank === 0) toArchive.add(queen.key);
});

const stopArchiving = channelService.subscribeAfterEachFlush(channelSlot, () => {
    const archived = [...toArchive].flatMap((key) => cardService.findSlotByKey(cards, key) ?? []);
    cardContentService.deleteEntities(cards, archived);
    toArchive.clear();
});

cardContentService.upsertEntity(cards, { id: 'q', deckId: 'hearts', title: 'Queen', rank: 0 });
db.flush();
db.flush();

stopArchiving();
effectService.disposeEffect(queenEffect);
```

Why this way: an effect runs on a half-delivered frame, so a write from it
would land in a frame that is no longer collecting; it throws, and the throw goes
to the error policy. An after-each-flush handler runs from the flush's `finally`,
after the frame and the unused-slot collector's give-back, when writes are
accepted again; its write lands in the next frame — the second `db.flush()` above
delivers the delete. A microtask queued from an effect or an after-each-frame
handler runs after `flush()` has returned, which works for the same reason.

Reference: [After the flush has ended](/docs/core/channel#after-the-flush-has-ended),
[The rules](/docs/core/channel#the-rules).

## Clean up what an effect body started

Take: return a function from the body. A cleanup list of your own next to
the effect is unnecessary.

```ts
declare function pollPrices(deckId: string): void;

const deckCard = cardService.getSlotByKey(cards, 'c1');

const pollEffect = effectService.createEffectImmediate(db, [deckCard], [], () => {
    const deckId = deckCard.entity?.deckId;
    if (deckId === undefined) return;
    const timer = setInterval(() => { pollPrices(deckId); }, 5_000);
    return () => { clearInterval(timer); };
});

effectService.disposeEffect(pollEffect);
```

Why this way: the body's type is `TOIMEffectBody`, `() => (() => void) | void`.
A returned function is called before the next run of the body and by `disposeEffect`,
so each run closes what the previous one opened. What is returned is checked with
`typeof`, so an expression-bodied arrow that happens to return a non-function
value is ignored.

Reference: [A body may hand back its own undo](/docs/core/reading-subscribing#a-body-may-hand-back-its-own-undo).

## Route errors from effects

Take: an `errorPolicy` in the `OIMDB` options —
`OIMErrorPolicyLogAndContinue({ onError })` to report and go on (the default,
without `onError`), `OIMErrorPolicyThrowAtOnce` in tests. A try/catch inside
every effect body is unnecessary.

```ts
import { OIMErrorPolicyLogAndContinue, OIMErrorPolicyThrowAtOnce } from '@oimdb/core';

declare function report(error: unknown): void;

const reportingDb = new OIMDB({
    errorPolicy: new OIMErrorPolicyLogAndContinue({ onError: (error) => { report(error); } }),
});

const strictDb = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
```

Why this way: during a flush, every effect run (the body and the cleanup the
previous run returned), `onBeforeFlush`, and every after-each-frame and
after-each-flush handler runs inside a try/catch that hands the throw to the
policy. The first run of `createEffectImmediate` is not inside a flush: its throw
reaches the caller. `OIMErrorPolicyLogAndContinue` calls `console.error`, then `onError`,
and the frame goes on. `OIMErrorPolicyThrowAtOnce` throws the first error out of
`flush()`, and the effects not yet reached wait for the next flush. In either mode an
effect counts as having run only after its body returns, so a body that threw takes
the same change again at its next wake. A policy is
one method, `onErrorCaught(error)`, so any object with it is an `IOIMErrorPolicy`.

Reference: [Error handling](/docs/guides/error-handling).

## Know which entities changed in a frame

Take: `OIMContentChangeListenerService.INSTANCE.addContentChangeListener(cards, listener, undefined)` to collect
keys, and `subscribeAfterEachFrame(channelSlot, handler)` to read them at the frame boundary. One effect per
entity cannot do this, because an entity written for the first time has no effect on it yet.

```ts
import { OIMContentChangeListenerService, type IOIMContentChangeListener, type TOIMEntitySlot } from '@oimdb/core';

const changedInFrame = new Set<TOIMStoreKey>();
const changedListener: IOIMContentChangeListener<TOIMEntitySlot<Card, TOIMStoreKey>, Partial<Card>> = {
    onContentChanged: (slot) => { changedInFrame.add(slot.key); },
    onContentChangedMany: (slotChannelQueue) => {
        for (let i = 0; i < slotChannelQueue.getEntryCount(); i++) changedInFrame.add(slotChannelQueue.getEntryAt(i).key);
    },
};
OIMContentChangeListenerService.INSTANCE.addContentChangeListener(cards, changedListener, undefined);
const stopReporting = channelService.subscribeAfterEachFrame(channelSlot, () => {
    render([...changedInFrame]);
    changedInFrame.clear();
});

cardContentService.upsertEntities(cards, [
    { id: 'c1', deckId: 'spades', title: 'Ace', rank: 1 },
    { id: 'c2', deckId: 'spades', title: 'Two', rank: 2 },
]);
db.flush();

stopReporting();
OIMContentChangeListenerService.INSTANCE.removeContentChangeListener(cards, changedListener);
```

Why this way: the listener is per store slot and is told synchronously at the
write. With `readColumnNames` `undefined` it hears a write to any column; a list of column names narrows it, and
the filter is the union over every listener on that store slot. It is told once per write through
`onContentChanged`, and once per batch write through `onContentChangedMany`. The after-each-frame handler runs
once the frame's effects have run, so it reads settled state; a write from it is refused, so act on the
set after `flush()` returns. The set is yours, so clearing it consumes nothing
anyone else reads. While an after-each-frame handler is registered, every write
asks for a frame.

Reference: [Which entities changed in a frame](/docs/packages/snapshot-manager#which-entities-changed-in-a-frame),
[Work that needs the whole settled frame](/docs/core/channel#work-that-needs-the-whole-settled-frame).
