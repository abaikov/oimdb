---
sidebar_position: 6
title: Persistence, SSR and server sync
description: Save entity store slots to localStorage or IndexedDB, render on the server and hydrate, update optimistically, apply server pushes and mirror into Redux.
---

# Persistence, SSR and server sync

Getting state in and out of the engine: saving an entity store slot to `localStorage`
or IndexedDB and loading it on start, rendering on the server and hydrating on
the client, an optimistic update that rolls back on failure, applying a patch
pushed by the server, and keeping a Redux store in step with an entity store slot.

```ts setup
import {
  OIMChannelService, OIMDB, OIMSlotContentBucketServiceSetDriven,
  createOIMBucketService, createOIMEntityService, createOIMEntityWriterInPlace,
} from '@oimdb/core';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
  OIMPersistCodecIdentity, OIMPersistEntityWriter, OIMPersistRecordSourceCollectionChangeDriven,
  OIMPersistRecordSourceCollectionWriteDriven, OIMPersistResourceRecords, OIMPersistResourceSnapshot, OIMPersistSchedulerMicrotaskDriven, OIMPersistor,
} from '@oimdb/persist';
import type { TOIMPersistRecords } from '@oimdb/persist';

type Card = { id: string; deckId: string; title: string; rank: number };
type TCardSlot = TOIMEntitySlot<Card>;

declare function renderApp(db: OIMDB): string;
declare function hydrateApp(): void;
declare function report(error: unknown): void;

function createDeckService(deckDb: OIMDB) {
  return createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
  >(deckDb, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
}

const db = new OIMDB({ channelScheduler: (flush) => { void Promise.resolve().then(flush); } });
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const cardContentService = cardService.slotContentService;
const deckService = createDeckService(db);
const decks = deckService.createStoreSlot(db);
```

## Save an entity store slot to localStorage and load it on start

Take: an `OIMPersistEntityWriter` wrapped around the writer, passed as the
entity collection's `entityWriter`; an `OIMPersistor` over `OIMPersistLocalStorageBackend`
from `@oimdb/persist-localstorage` with `OIMPersistSchedulerMicrotaskDriven`; and
one `OIMPersistResourceSnapshot` of an `OIMPersistRecordSourceCollectionWriteDriven`
over the collection service and its store slot, with `OIMPersistKeyValueEntryStrategy({ storageKey })`. A bucket
source (`OIMPersistRecordSourceBucketDriven`) does not suit a whole store slot: it
persists only the slots you write into a bucket, and every insert would have to
re-state that list.

```ts
import { OIMPersistKeyValueEntryStrategy } from '@oimdb/persist';
import { OIMPersistLocalStorageBackend } from '@oimdb/persist-localstorage';

type TCardRecords = TOIMPersistRecords<TOIMStoreKey, Card>;

const savedCardPersistEntityWriter = new OIMPersistEntityWriter<Card, TOIMStoreKey>({
  entityWriter: createOIMEntityWriterInPlace(),
});
const savedCardCollectionService = createOIMEntityService<Card>(db, {
  keyOf: (card) => card.id,
  entityWriter: savedCardPersistEntityWriter,
});
const savedCardEntityStoreSlot = savedCardCollectionService.createStoreSlot(db);

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistLocalStorageBackend(),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
  onPersistError: (error) => report(error),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: savedCardCollectionService,
    entityStoreSlot: savedCardEntityStoreSlot,
    persistEntityWriter: savedCardPersistEntityWriter,
  }),
  persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TCardRecords>({ storageKey: 'app:cards' }),
  persistCodec: new OIMPersistCodecIdentity<TCardRecords>(),
}));

await persistor.hydrate();
persistor.start();

savedCardCollectionService.slotContentService.upsertEntity(
  savedCardEntityStoreSlot, { id: 'c1', deckId: 'spades', title: 'Ace', rank: 1 },
);
```

Why this way: the write-driven source learns what changed inside the write —
`OIMPersistEntityWriter` reports the slot of every write that moved a column —
so it needs no channel, every write stays on the core fast path, and what it
persists is every entity of that store slot that holds a value. It does not hear an in-place edit
announced with `markEntityChanged`; an application that
edits entities in place takes `OIMPersistRecordSourceCollectionChangeDriven`
instead, as in the IndexedDB recipe below. The microtask scheduler coalesces
every report before the first microtask into one write batch. `localStorage`
holds one string per key, so the whole store slot is written under `app:cards`
on every write batch. Hydrate before `start()`: `start()` subscribes, and the
store slot source reports nothing at subscribe time, so `start()` writes nothing
for it; a storage key that holds nothing makes `hydrate()` apply nothing. The persist is a mirror: an entity a release policy takes out of memory
is cleared through the same writer and deleted from storage too;
`persistor.unload(persistResourceRecords, keys)` is the call that drops entities
from memory and keeps them on the backend, and it takes an
`OIMPersistResourceRecords`.

Reference: [Persist — Choosing a source, a resource and a scheduler](/docs/packages/persist#choosing-a-source-a-resource-and-a-scheduler),
[Hydration](/docs/packages/persist#hydration),
[A release is a deletion](/docs/packages/persist-storage#a-release-is-a-deletion-unload-is-the-other-door).

## Save an entity store slot to IndexedDB, writing only what changed

Take: an `OIMPersistor` over `OIMPersistIndexedDbBackend` from
`@oimdb/persist-idb` with a `databaseName`, and one `OIMPersistResourceRecords` of
an `OIMPersistRecordSourceCollectionChangeDriven` with
`OIMPersistIndexedDbRecordsStrategy({ tableName })`. A snapshot resource does not suit a
large store slot: it stores the whole store slot as one value and rewrites all of
it on every write batch.

```ts
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy } from '@oimdb/persist-idb';

const offlineCardPersistEntityWriter = new OIMPersistEntityWriter<Card, TOIMStoreKey>({
  entityWriter: createOIMEntityWriterInPlace(),
});
const offlineCardCollectionService = createOIMEntityService<Card>(db, {
  keyOf: (card) => card.id,
  entityWriter: offlineCardPersistEntityWriter,
});
const offlineCardEntityStoreSlot = offlineCardCollectionService.createStoreSlot(db);

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistIndexedDbBackend({ databaseName: 'app' }),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
  onPersistError: (error, { persistOperation }) => report({ persistOperation, error }),
});
persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven({
    entityCollectionService: offlineCardCollectionService,
    entityStoreSlot: offlineCardEntityStoreSlot,
    persistEntityWriter: offlineCardPersistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<TOIMStoreKey, Card>({ tableName: 'cards' }),
}));

await persistor.hydrate();
persistor.start();
```

Why this way: `OIMPersistIndexedDbRecordsStrategy` keeps one IndexedDB record per
entity, and `OIMPersistResourceRecords` writes only the entities that changed
since the last write batch: one put or one delete per changed key, in one
transaction. The change-driven source also persists an in-place edit announced
with `markEntityChanged`; the price is that, while the resource listens, every
write to `offlineCardEntityStoreSlot` leaves the core fast path (one subframe
opened and closed, the changed-column bookkeeping and the content-change listener
loop per write). Where every change goes through the upsert, update and delete
doors, `OIMPersistRecordSourceCollectionWriteDriven` takes the same options and
skips that cost. An object store that does not exist yet is created on write by
reopening the database at a higher version, and a read never creates one — so a
table that was never written reads as "nothing stored" and hydrating applies
nothing, while a table saved empty empties the store slot. A failed write keeps
its change for the next write batch, and a resource whose autosave fails three
consecutive times is quarantined and reported through `onPersistError` with
`persistOperation: 'quarantine'`.

Reference: [Persist — Records: per-key deltas](/docs/packages/persist#records-per-key-deltas),
[Persist: backends — IndexedDB](/docs/packages/persist-backends#indexeddb),
[What a failed write leaves behind](/docs/packages/persist-storage#what-a-failed-write-leaves-behind).

## Render on the server and hydrate on the client

Take: on the server, a fresh `OIMDB` per request, `insertEntities` for the
content and `writeBucketMemberSlots` for each bucket's list, then serialize both; on the
client, the same services and store slots and the same two writes before the first render.
A persistor is unnecessary unless the application already registers its store slots
with one: an SSR fill is two ordinary writes on each side.

```ts
function renderDeckPage(deckCards: readonly Card[]): string {
  const requestDb = new OIMDB();
  const requestCardService = createOIMEntityService<Card>(requestDb, { keyOf: (card) => card.id });
  const requestCards = requestCardService.createStoreSlot(requestDb);
  const requestDeckService = createDeckService(requestDb);
  const requestDecks = requestDeckService.createStoreSlot(requestDb);

  requestCardService.slotContentService.insertEntities(requestCards, deckCards);
  const deck = requestDeckService.holdSlotByKey(requestDecks, 'current');
  requestDeckService.slotContentService.writeBucketMemberSlots(
    deck, deckCards.map((card) => requestCardService.getSlotByKey(requestCards, card.id)),
  );
  requestDb.flush();

  const html = renderApp(requestDb);
  const state = JSON.stringify({ cards: deckCards, deckCardIds: deckCards.map((card) => card.id) });
  OIMChannelService.INSTANCE.dropChannelSlot(requestDb.defaultChannelSlot);
  return `${html}<script>window.__OIM__ = ${state.replace(/</g, '\\u003c')}</script>`;
}
```

```ts
const state = (window as unknown as { __OIM__: { cards: Card[]; deckCardIds: string[] } }).__OIM__;

cardContentService.insertEntities(cards, state.cards);
const currentDeck = deckService.holdSlotByKey(decks, 'current');
deckService.slotContentService.writeBucketMemberSlots(currentDeck, state.deckCardIds.map((id) => cardService.getSlotByKey(cards, id)));
db.flush();

hydrateApp();
```

Why this way: two things cross the wire, the entities and which slots are
in which bucket, because a bucket's list is a fact about the response and no
column can express it. `insertEntities` fits both sides because its precondition
is the one an SSR fill meets: its keys are new, and the whole load is one subframe. A client that may
already hold some of those keys takes `upsertEntities` instead. `writeBucketMemberSlots` states the whole list,
so restating it evicts what the snapshot does not name. The hold keeps a bucket filed even when
it is empty, and `dropChannelSlot` ends a per-request channel that
nothing subscribes to without walking a slot; it does not check that
precondition, so do not call it on a channel something subscribes to. Escape
`<` before inlining the state, or a `</script>` inside the data ends the tag.

Reference: [Server-side rendering](/docs/guides/ssr),
[Dropping the whole channel](/docs/core/channel#dropping-the-whole-channel).

## Update optimistically and roll back on failure

Take: read the columns you are about to change, write the new values with
`updateEntity` on the slot, and on failure write the old values back with
`updateEntity` again. A saved reference to the entity cannot hold the old
values: the default writer is the in-place one, which writes the moved columns into
the stored object, so a reference you kept shows the new value too.

```ts
declare function saveTitle(cardId: string, title: string): Promise<void>;

async function renameCard(cardId: string, title: string): Promise<void> {
  const cardSlot = cardService.findSlotByKey(cards, cardId);
  const current = cardSlot?.entity;
  if (cardSlot === undefined || current === undefined) return;
  const previousTitle = current.title;

  cardContentService.updateEntity(cardSlot, { title });
  try {
    await saveTitle(cardId, title);
  } catch (error) {
    if (cardSlot.entity !== undefined) cardContentService.updateEntity(cardSlot, { title: previousTitle });
    report(error);
  }
}
```

Why this way: a patch moves only the columns it names, so the rollback
undoes this update and nothing else — a server push that changed `rank` while the
request was in flight survives it, which `upsertEntity(previous)` would not:
a whole-value write brings the entity back to exactly the old value and takes
away anything that arrived since. `findSlotByKey` mints nothing when the key resolves to nothing, and the
rollback checks that the entity is still there, so an entity deleted during the request is not brought back by
it. The slot is the identity the update landed on; it stays filed while it holds a value. Each write is delivered
on the next frame (the delivery of every write since the previous one; see the
[glossary](/docs/core/model#glossary)), so the optimistic value renders before the
request returns.

Reference: [Writing — The writes](/docs/core/writing#the-writes),
[The two writers](/docs/core/writing#the-two-writers).

## Apply a server push or a websocket patch

Take: `upsertEntities` for whole entities and `deleteEntities` for removals,
which are batch writes, and `updateEntity` for a patch, which writes one entity,
all inside one `openSubframe` / `closeSubframe` pair on the channel slot. A loop of
`upsertEntity` for a patch message would take away every column the patch does not
carry, because a whole-value write replaces the entity.

```ts
type CardsMessage =
  | { type: 'upsert'; cards: Card[] }
  | { type: 'patch'; id: string; patch: Partial<Card> }
  | { type: 'delete'; ids: string[] };

function applyServerMessages(messages: readonly CardsMessage[]): void {
  const channelSlot = db.defaultChannelSlot;
  OIMChannelService.INSTANCE.openSubframe(channelSlot);
  try {
    for (const message of messages) {
      if (message.type === 'upsert') {
        cardContentService.upsertEntities(cards, message.cards);
      } else if (message.type === 'patch') {
        const patched = cardService.findSlotByKey(cards, message.id);
        if (patched !== undefined) cardContentService.updateEntity(patched, message.patch);
      } else {
        const deleted = message.ids.flatMap((id) => cardService.findSlotByKey(cards, id) ?? []);
        cardContentService.deleteEntities(cards, deleted);
      }
    }
  } finally {
    OIMChannelService.INSTANCE.closeSubframe(channelSlot);
  }
}

declare const socket: WebSocket;
socket.addEventListener('message', (event) => {
  applyServerMessages(JSON.parse(String(event.data)) as CardsMessage[]);
});
```

Why this way: a subframe is one logical change. No frame can close while
one is open, so no subscriber sees half of the message, and a write that asks for a frame inside it is owed that frame by the `closeSubframe` that brings the
count to zero. `upsertEntities` and `deleteEntities` open a content subframe of their
own and hand an index every slot of the batch at once; `updateEntity` opens one
for its single write when anything reads its columns. A re-sent entity that changes no column wakes
nobody, because the writer compares each column and a write with nothing moved
returns before it reaches the channel. A patch for a key the client never
loaded is dropped: `findSlotByKey` mints nothing for a missing key. Do not call `flush()` inside the pair; it
throws while a subframe is open.

Reference: [The subframe](/docs/core/channel#the-subframe),
[Which write to take](/docs/core/writing#which-door-to-take).

## Keep a Redux store in step with an entity store slot

Take: `new OIMReduxAdapter({ channelMap: db })`, `adapter.createCollectionReducer(entityCollectionService, entityStoreSlot)`
for each mirrored store slot, `adapter.createMiddleware()` in the store, and
`adapter.setStore(store)` once the store exists. New views should not read engine
state through Redux: a selector then finds each entity again by key, the lookup an
identity-addressed slot removes. New React views read with `@oimdb/react`.

```ts
import { applyMiddleware, combineReducers, createStore } from 'redux';
import { OIMReduxAdapter } from '@oimdb/redux-adapter';
import type { TOIMReduxDefaultCollectionState } from '@oimdb/redux-adapter';

const adapter = new OIMReduxAdapter({ channelMap: db });
const cardsReducer = adapter.createCollectionReducer<
  Card, string, TOIMReduxDefaultCollectionState<Card, string>
>(cardService, cards);

const store = createStore(
  combineReducers({ cards: cardsReducer }),
  applyMiddleware(adapter.createMiddleware()),
);
adapter.setStore(store);

cardContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'Ace', rank: 1 });
db.flush();
store.getState().cards;
```

Why this way: the engine stays the one source of truth and Redux holds a
projection of it, so no field needs a merge rule. The adapter watches each
entity with an ordinary effect and a content-change listener on the store slot,
and after a frame that moved anything it registered it dispatches one
`OIMDB_UPDATE` action; a frame that touched nothing registered dispatches
nothing. The default state is `{ entities, ids }`. The middleware flushes the db's channel slot after every
action, so a write a child reducer makes settles before the dispatch returns. `setStore` dispatches at once if
anything moved before the store existed, which Redux's creation order makes possible. Address
the mirrored store slot with one key type: the default mapper throws when `1`
and `'1'` would land on one property name.

Reference: [Redux Adapter](/docs/packages/redux-adapter).
