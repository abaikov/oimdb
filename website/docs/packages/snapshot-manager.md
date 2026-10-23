---
sidebar_position: 6
description: Why @oimdb/snapshot-manager exports nothing, why there is no shared changelog, and which engine door to use to learn what changed in a frame.
---

# Snapshot Manager

`@oimdb/snapshot-manager` exports nothing. Do not add it to a new project.

<InShort>

- The package exports nothing.
- A list of changed entities that is cleared when read is the wrong shape for a store with several consumers.
- Each job such a list is taken for is answered by a door that exists for that job.

</InShort>

## Why there is no shared changelog

A list of changed entities that is cleared when read is the wrong shape for a
store with several consumers:

- **The read is not idempotent.** Two calls with no write between them return
  different answers, because the first consumes what it returns. Whoever reads
  first takes the changes from everybody else, so two consumers cannot share one.
- **"Snapshot" already means the opposite.** In `@oimdb/persist` a snapshot is the
  full current state of a source (`TOIMPersistRecords` for a collection).

Each job such a list is taken for has a door that exists for that job,
and each of those doors belongs to the consumer that opens it.

```ts setup
import { OIMDB, createOIMEntityService, type TOIMStoreKey } from '@oimdb/core';

type Card = { id: string; title: string };

const db = new OIMDB();
const cardService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
const cards = cardService.createStoreSlot(db);
```

## Which door for which job

| You want to know… | Use | Documented at |
|---|---|---|
| which keys to write to storage | `@oimdb/persist`: `OIMPersistEntityWriter` reports every entity slot it writes to whoever called its `subscribeEntitySlotWritten(onEntitySlotWritten)`, and an `OIMPersistResourceRecords` over `OIMPersistRecordSourceCollectionWriteDriven` keeps those slots until the persistor's next write batch takes them. It needs no channel. | [Persist](/docs/packages/persist) |
| that one entity, bucket or derived value changed | an effect: `OIMEffectService.INSTANCE.createEffect(db, [slot], [], body)` | [Reading and subscribing](/docs/core/reading-subscribing#subscribing-is-building-an-effect) |
| which entities of a collection changed during a frame | a content-change listener on the collection's store slot, read at the frame boundary | below, and [Indexes](/docs/core/oimindex#the-content-change-hook-and-indexkeys) |
| whether a slot moved since a point you remember | the slot's own stamps, `changedAtRevision` and `changedAtEpoch`, against `db.clock` (`oimIsAnySlotChangedAfter`) | [The clock](/docs/core/channel#the-clock) |

### Which entities changed in a frame

A content-change listener is told synchronously, at the write, about every slot
whose content moved. It hears once per write through `onContentChanged`, or once
per batch (`upsertEntities`, `insertEntities`, `deleteEntities`, …) through
`onContentChangedMany`. `OIMChannelService.INSTANCE.subscribeAfterEachFrame(channelSlot, handler)` gives you the
boundary. The set below is yours, so clearing it after reading takes nothing
away from anybody else:

```typescript
import { OIMChannelService, OIMContentChangeListenerService, type IOIMContentChangeListener, type TOIMEntitySlot } from '@oimdb/core';

const movedInFrame = new Set<TOIMStoreKey>();
const movedListener: IOIMContentChangeListener<TOIMEntitySlot<Card, TOIMStoreKey>, Partial<Card>> = {
    onContentChanged: slot => { movedInFrame.add(slot.key); },
    onContentChangedMany: slotChannelQueue => {
        for (let i = 0; i < slotChannelQueue.getEntryCount(); i++) movedInFrame.add(slotChannelQueue.getEntryAt(i).key);
    },
};
OIMContentChangeListenerService.INSTANCE.addContentChangeListener(cards, movedListener, undefined);
const stopReporting = OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
    console.log([...movedInFrame]);
    movedInFrame.clear();
});

cardService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'Ace' });
db.flush();   // logs ['c1']

stopReporting();
OIMContentChangeListenerService.INSTANCE.removeContentChangeListener(cards, movedListener);
```

**Why a listener rather than an effect here.** An effect is per slot: watching a
whole collection with effects means one effect per entity, and an entity written
for the first time has no effect on it yet. The listener is per store slot and
sees every write to it, including the first. Registered with every column (`readColumnNames` `undefined`),
it makes every write to that store slot a little slower for as long as it is registered.

**Why not inside the frame.** The listener runs during the write, before the
frame has delivered anything. The after-each-frame handler runs once the frame's
effects have run, so what it reads is the settled state. A write from that
handler is refused because it is still inside `flush()`, so act on the list after
`flush()` returns, or hand it to something that does.

## If you have it installed

The versions published on npm are untouched and keep working for anything that
installed them. Nothing was unpublished. They were built against the
`@oimdb/core` this tree replaced — the latest, 2.2.0, declares `@oimdb/core`
`^3.8.0` as its peer, as the registry reads, so it does not work with
`@oimdb/core` 4.x.
