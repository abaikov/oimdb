---
sidebar_position: 4
title: Memory and lifetime
description: Control how long data stays in memory, from screen-scoped data and reads that keep nothing to expiring caches, logout cleanup and long-lived handles.
---

# Memory and lifetime

How long data stays in memory: keeping a screen's data while the screen is open,
reading without keeping, caches that expire, store slots that never release,
dropping everything on logout, and which handle to keep in long-lived code.

```ts setup
import { OIMDB, createOIMEntityService, oimIsSlotReleased, type TOIMStoreKey } from '@oimdb/core';

type Card = { id: string; deckId: string; title: string; rank: number };

declare function render(value: unknown): void;

const db = new OIMDB();
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
```

## Keep a screen's data only while the screen is open

Take: `holdSlotByKey(storeSlot, key)` when the screen opens and `slot.owner.unholdSlot(slot)` when it
closes — on a collection built with `OIMSlotReleasePolicyAtUnhold` if the data
must go with the screen. Do not rely on the default policy for that: under
`OIMSlotReleasePolicyAtEmpty` an unhold leaves a slot with a value standing.

```ts
import { OIMSlotReleasePolicyAtUnhold, createOIMIndexService } from '@oimdb/core';

const reserved = cardService.holdSlotByKey(cards, 'c1');
cardService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'Ace', rank: 1 });
reserved.owner.unholdSlot(reserved);
const keptByDefault = cardService.hasSlotContentByKey(cards, 'c1');

const screenDb = new OIMDB({ slotReleasePolicy: OIMSlotReleasePolicyAtUnhold.INSTANCE });
const deckCardService = createOIMEntityService<Card>(screenDb, { keyOf: (card) => card.id });
const deckCards = deckCardService.createStoreSlot(screenDb);
const deckCardsByDeckService = createOIMIndexService(screenDb, {
    entityService: deckCardService,
    keyOf: (card: Card) => card.deckId,
});
const deckCardsByDeck = deckCardsByDeckService.createIndexStoreSlot(deckCards);

function openDeckScreen(deckId: string, loaded: readonly Card[]): () => void {
    const deck = deckCardsByDeckService.holdSlotByKey(deckCardsByDeck, deckId);
    deckCardService.slotContentService.upsertEntities(deckCards, loaded);
    render(deckCardsByDeckService.getEntitiesByKey(deckCardsByDeck, deckId));
    return () => { deck.owner.unholdSlot(deck); };
}
```

Why this way: a hold is a count on the slot, kept by its owner; the slot goes
only when nothing holds it, no effect is on it, and the release
policy agrees. The default `OIMSlotReleasePolicyAtEmpty` lets go of empty slots
only, so `keptByDefault` is `true` — a store of entities keeps what was written.
Under `OIMSlotReleasePolicyAtUnhold` a slot goes at its last unhold, value and
all, and a write into a key nobody holds is released at once. That is why the
screen holds the deck's bucket before it writes: a bucket holds each of its
members, so the cards filed into the held deck stay; when the bucket is unheld it
is released, its members' holds are given back, and they go.

Reference: [Slot lifecycle](/docs/core/lifecycle),
[Releasing an identity on a clock](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).

## Read without keeping

Take: `slotContentService.findEntityByKey(storeSlot, key)` for a value you do not keep — it mints nothing — or
`findSlotByKey(storeSlot, key)` for the slot without minting, `getSlotByKey(storeSlot, key)` when you need a slot
whether or not one exists, and `hasSlotContentByKey(storeSlot, key)` when you only need to know whether a value
exists. Wrap reads in `OIMUnusedSlotCollectorService.INSTANCE.run(db.collectorSlot.unusedSlotCollectorSlot, body)`
(or `open` / `close`) when they must survive a flush; for a set of reads with its own end, use an unused-slot
collector slot of your own. Do not use `holdSlotByKey` for a one-off read: that hold is yours to give back.

```ts
import { OIMUnusedSlotCollectorService, createOIMUnusedSlotCollectorSlot } from '@oimdb/core';

const unusedSlotCollectorService = OIMUnusedSlotCollectorService.INSTANCE;
const title = cardService.slotContentService.findEntityByKey(cards, 'c2')?.title;
const known = cardService.hasSlotContentByKey(cards, 'c3');

unusedSlotCollectorService.run(db.collectorSlot.unusedSlotCollectorSlot, () => {
    const first = cardService.getSlotByKey(cards, 'c2');
    db.flush();
    render(cardService.getSlotByKey(cards, 'c2') === first);
});

const panelUnusedSlotCollectorSlot = createOIMUnusedSlotCollectorSlot();
unusedSlotCollectorService.holdSlotUntilFlush(panelUnusedSlotCollectorSlot, cardService.getSlotByKey(cards, 'c4'));
unusedSlotCollectorService.holdSlotUntilFlush(panelUnusedSlotCollectorSlot, cardService.getSlotByKey(cards, 'c5'));
unusedSlotCollectorService.flush(panelUnusedSlotCollectorSlot);
```

Why this way: a getter that finds no identity mints one, so a subscription
taken right after the read lands on the slot every later write uses. The mint is
held by the db's unused-slot collector, which gives every such hold back at
the end of the next flush; an empty slot nothing else keeps then goes.
`findSlotByKey` and `hasSlotContentByKey` mint nothing. A scope defers the give-back: scopes nest, only
the close that brings the depth to zero gives the holds back, `close` without an
`open` throws, and `run` closes from a `finally`. A collector slot of your own holds
each slot you `holdSlotUntilFlush` until its own `flush`.

Reference: [The unused-slot collector](/docs/core/reading-subscribing#the-unused-slot-collector),
[Which read mints](/docs/core/reading-subscribing#which-read-mints).

## Cache with expiry

Take: a timed `slotReleasePolicy` at construction —
`OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs })` for data that goes stale,
`OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs })` for what was recently watched,
`OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs })` for navigating back to a
screen, and `OIMSlotReleasePolicyEarliest([...])` to combine them. There is no
release call, so a sweep of your own over the store slot has nothing to call.

```ts
import {
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotReleasePolicyAfterUnhold,
    OIMSlotReleasePolicyAfterWrite,
    OIMSlotReleasePolicyEarliest,
} from '@oimdb/core';

const cacheDb = new OIMDB();
const searchResultService = createOIMEntityService<Card>(cacheDb, {
    keyOf: (card) => card.id,
    slotReleasePolicy: new OIMSlotReleasePolicyEarliest([
        new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 60_000 }),
        new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 30_000 }),
    ]),
});
const searchResults = searchResultService.createStoreSlot(cacheDb);

const backStackDb = new OIMDB({
    slotReleasePolicy: new OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs: 5_000 }),
});
const recentCardService = createOIMEntityService<Card>(backStackDb, { keyOf: (card) => card.id });
const recentCards = recentCardService.createStoreSlot(backStackDb);
```

Why this way: how long data is worth keeping is a property of the
collection type, so it is chosen once — per `OIMDB` through its `slotReleasePolicy`, or
per collection through the option of the same name — and every store slot of that type shares it. Each timed
policy keeps its own deadline on the slot and its own queue; the clock and the timer are the db's. Every write
that leaves a value renews the write window, the last subscriber leaving opens an idle window,
and the last unhold opens an unhold window. A held slot is off the clock: a hold,
including the one an effect takes, outranks every deadline, and a slot whose
window ran out while held goes at the give-back. Slots are swept in slices of
`OIM_SLICE_LENGTH_MS`, so a slot goes at the first sweep at or after its
deadline, never before.

Reference: [Releasing an identity on a clock](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing),
[Controlling the clock](/docs/core/lifecycle#controlling-the-clock).

## Never release

Take: `OIMSlotReleasePolicyNever` for a small, fixed key space whose
identities must stay stable — settings, a fixed set of decks, a computed every
screen reads. Do not use it for a store slot keyed by anything a user or a server
can grow: nothing in it ever leaves memory.

```ts
import {
    OIMSlotReleasePolicyNever, OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService,
    type TOIMComputedSlot, type TOIMSingleSlotStore,
} from '@oimdb/core';

type Deck = { id: 'spades' | 'hearts' | 'diamonds' | 'clubs'; name: string };

const deckService = createOIMEntityService<Deck>(db, {
    keyOf: (deck) => deck.id,
    slotReleasePolicy: OIMSlotReleasePolicyNever.INSTANCE,
});
const decks = deckService.createStoreSlot(db);

const spadesSlot = deckService.getSlotByKey(decks, 'spades');
const spadesNameService = createOIMComputedService<void, string, TOIMSingleSlotStore<TOIMComputedSlot<string, void>>>({
    initialValue: '',
    slotReleasePolicy: OIMSlotReleasePolicyNever.INSTANCE,
    computedSlotStoreService:
        OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<string, void>>,
});
const spadesName = spadesNameService.createComputedStoreSlot(
    db,
    () => spadesSlot.entity?.name ?? '',
    () => ({ sourceSlots: [spadesSlot] }),
);
const spadesNameSlot = spadesNameService.computedCollectionService.getSlotByKey(spadesName, undefined);
render(spadesNameSlot.computedValueService.getValueForSlot(spadesNameSlot));
```

Why this way: `OIMSlotReleasePolicyNever` answers "keep it" for a slot with a
value and for an empty one, so a deleted key's slot stays filed, and so does
every empty slot a read minted — `getSlotByKey` over arbitrary keys grows the
store for good. In return a slot object stays the same for the life of the
store slot, so a reference to it never goes dead. On a computed it keeps the
computed slot and every source it holds for the life of the store slot.

Reference: [Asked to go — the release policy answers](/docs/core/lifecycle#asked-to-go--the-release-policy-answers),
[Releasing a computed and its sources](/docs/core/computed-effects#releasing-a-computed-and-its-sources).

## Drop everything on logout

Take: `OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot)`, then drop every reference to that
`OIMDB`, its services, their store slots and their slots, and build a new `OIMDB` for the next
session. Do not call `deleteEntities` or `clearAllEntities` over every
store slot: those take values away one by one and leave every identity something keeps.

```ts
import { OIMChannelService } from '@oimdb/core';

let sessionDb = new OIMDB();
let sessionCardService = createOIMEntityService<Card>(sessionDb, { keyOf: (card) => card.id });
let sessionCards = sessionCardService.createStoreSlot(sessionDb);

function logOut(): void {
    OIMChannelService.INSTANCE.dropChannelSlot(sessionDb.defaultChannelSlot);
    sessionDb = new OIMDB();
    sessionCardService = createOIMEntityService<Card>(sessionDb, { keyOf: (card) => card.id });
    sessionCards = sessionCardService.createStoreSlot(sessionDb);
}
```

Why this way: the call walks no slot. It sets a flag, cancels the frame it had
scheduled (a frame is the delivery of every write since the previous one; see the
[glossary](/docs/core/model#glossary)), gives back the unused-slot collector's holds, and empties the pending
effects and the after-each-frame and after-each-flush handlers; everything else
becomes garbage together once you drop your references. The condition is yours to
keep, and nothing checks it: nothing may still be subscribed to that channel and
expect to be told — a standing effect never runs again, with no throw and no
report. After the call, a write to the old channel is not refused, but it asks
for no frame and nothing it scheduled is delivered; `flush()` returns at once.

Reference: [Dropping the whole channel](/docs/core/channel#dropping-the-whole-channel).

## Keep a long-lived handle correctly

Take: keep the collection service and its store slot (an entity, index or computed one) and the key,
and resolve the slot when you need it; keep a slot only while you hold it. A
slot stored in a module or a class field across flushes without a hold is a dead
identity once it is released.

```ts
const late = cardService.getSlotByKey(cards, 'c9');
db.flush();
const isDead = oimIsSlotReleased(late);

try {
    late.owner.holdSlot(late);
} catch {
    const fresh = cardService.holdSlotByKey(cards, 'c9');
    render(fresh !== late);
    fresh.owner.unholdSlot(fresh);
}

class DeckView {
    public constructor(
        private readonly cardCollectionService: typeof cardService,
        private readonly entityStoreSlot: typeof cards,
        private readonly cardKey: TOIMStoreKey,
    ) {}

    public showCard(): void {
        render(this.cardCollectionService.getSlotByKey(this.entityStoreSlot, this.cardKey).entity);
    }
}
```

Why this way: a released slot leaves the store and gets its RELEASED flag set;
every call that works with it — `owner.holdSlot`, `owner.unholdSlot`, a write, a subscription,
`getValueForSlot` on a computed — throws "This identity was released". The key is
not dead: the next door for it mints a new slot, so `isDead` above is `true` and
the slot from `holdSlotByKey` is a different object. A service holds no slots and
is never released, and a store slot is not one a release policy takes (an index
store slot goes only through `disposeIndexStoreSlot`); both outlive every slot minted
through them, which is what makes them the handles to keep.

Reference: [Released — the slot is dead and its key can be minted again](/docs/core/lifecycle#released--the-slot-is-dead-and-its-key-can-be-minted-again),
[Both shapes are factories](/docs/core/computed-effects#both-shapes-are-factories).
