---
participant: "oimdb-3.12.1"
version: "3.12.1"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "b312657b6b11ad33"
verdict: "idiomatic"
summary: "createOIMCollectionKit with a field-masked writer and a derived array index per group, keyed emitters as the signal, renders at FRAME_END; the churn binding builds its collection without the kit so the column shape can subscribe through the exported field emitter, and the chain and diamond shapes build the OIMComputed nodes and OIMEffect the scripts ask for on the queue's compute runtime."
wirings:
  bind:
    verdict: "idiomatic"
    note: "Kit with OIMSlotWriterFieldMasked and the default merge updater (oimdb-legacy.ts:61-67), derivedArrayIndex by group ordered by compareRows with deps group, rank, id (68-75); one index.emitter.subscribeOnKey per view (107-112), keyed collection subscriptions only on the window's rows (116-136), refresh without re-subscribing when only content changed (139-147, 186-202). Writes are upsertMany/removeManyByPks/upsertOneByPk (208-228). deps make label and note writes irrelevant to the index (core-legacy/src/core/OIMDerivedCollectionIndexArrayBased.ts:40-47); with compareEntities any relevant write marks its bucket for a full re-sort (same file 205-207, 220-222), which the md records as a finding of the library. frame calls run() (278): 3.12.1 has no batch call, and every keyed delivery already waits for queue.flush() (core-legacy/src/core/OIMEventQueue.ts:127-186), which is settle (279)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty bucket subscriptions (oimdb-legacy.ts:1086)."
  churn.row:
    verdict: "idiomatic"
    note: "collection.emitter.subscribeOnKey per subscriber, release to unmount (415-426, 524-530); the slot is resolved untimed in holdChurnRows and item is read per wake (labelAt 355-358, 405-414), because the merge updater allocates a new entity per write. The body reads row `from`, the row the churn read fold expects of each slot (churnList mounts slot `at` on row `at`, scenarios.ts:2279). The collection is new OIMReactiveCollection with createUpdateEmitter (327-339) instead of the kit, which is the same constructor (core-legacy/src/dx/OIMCollectionKit.ts:24); the field emitter is a subclass that adds one method and leaves subscribeOnKey as it is (core/OIMCarrierKeyedFieldEmitter.ts:47-70). frame calls run() (383)."
  churn.wide:
    verdict: "idiomatic"
    note: "One subscribeOnKeys over the 64 keys (427-442); the body reads all 64 labels in reverse so the first is kept, more body work than the tinybase and baseline wide bodies, which read one."
  churn.column:
    verdict: "idiomatic"
    note: "collection.emitter.subscribeOnKeyFields(pk, labelMask, body) (444-454), the mask built once from the registry the field-masked writer was handed (326-335, 341), so its bits are the writer's (core/OIMSlotWriterFieldMasked.ts:55-63; core/OIMCarrierKeyedFieldEmitter.ts:56-70)."
  churn.chain:
    verdict: "idiomatic"
    note: "One OIMComputed with an on.collection dependency per root, deriving chainLevelOf(first root's label, 1) (456-471), depth - 1 more over on.computed, level k deriving chainLevelOf(level k-1, k) (472-478), and an OIMEffect on the head that renders head.get() (479-486), so the text is chainHeadOf(label, depth) (harness/derivations.ts:3-7). All on getOIMComputeRuntime(queue) (340), the runtime the kit uses (dx/OIMCollectionKit.ts:29). Unmount destroys the effect then the computeds head-first (487-492); dispose destroys the runtime after the collection (531-539). Constructed directly rather than through kit.computed/kit.effect because those add every node to the kit's OIMDisposeScope (dx/OIMCollectionKit.ts:53, 66), which has no removal (core/OIMDisposeScope.ts:46-53, 65-84). chainFrameWrite builds the same chains in prepare and times the frame alone."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two OIMComputed over the one root's on.collection deriving diamondLeftOf and diamondRightOf of its label, a third over on.computed of both deriving diamondJoinOf, and an OIMEffect on the join (oimdb-legacy.ts:495-523), on the same runtime as the chain. The runtime schedules by level (modules/effect/core/OIMEffect.ts:65, 138) and OIMEffect.onComputedInvalidate returns when already scheduled (same file 134-139), so the join and the subscriber run once per flush, which churnDiamond's check asserts. Unmount destroys the effect, the join, then both sides (516-521). Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "getSlotByPk per key and one item load (673-682); nothing resolved in advance."
  reads.byWindow:
    verdict: "idiomatic"
    note: "scrollTo moves the page start and marks shapeMoved (685-689); the settle re-reads the live bucket slice and re-points 32 keyed subscriptions (614-630, 701-714). frame calls run() (669)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "A second derivedArrayIndex keyed on group plus axis (563-566), so the library files both predicates; every write that touches group, rank or id maintains both indexes."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup (691-697) releases view A's index.emitter subscription (stops[0], 605-611), subscribes on the other group's key, points the page at that bucket (pagedGroup, 568, read by paged.slotsOf 583) and offset 0, and marks; the settle resyncs exactly as after scrollTo. View B is not marked, so viewSwitch's view-B check is met with no redundant delivery. The derived index keeps every group's bucket already, so the switch fills nothing. Not run."
  relations:
    verdict: "idiomatic"
    note: "Three kits on one queue, the pairs kit on OIMCollectionStoreTrieDriven keyed by a ctk tuple (747, 753-777); owner and pair slots resolved untimed for reading (846-904); patchOwnerName and writePair go through upsertOneByPk with the tuple built per call (908-918). OIMCollection has no slot-addressed write (core-legacy/src/core/OIMCollection.ts:97-150), so the pin saves only the read. frame calls run() (838)."
  single:
    verdict: "idiomatic"
    note: "OIMReactiveObject with a keyed subscription per property and a FRAME_END render (964-1038). frame calls run() (1024)."
improvements:
  - "oimdb-legacy.md 'The opt-ins': orderBy with a zero-padded rank joined to the id could express rank-then-id (OIMDerivedCollectionIndexArrayBased.ts:301-305 compares with < and >); neither wired nor measured, and whether every scripted rank is non-negative was not checked. Would move every bind row that writes rank if it is faster than compareEntities."
---

## Version and source

The adapter's `version` is `3.12.1` (`packages/bench/src/adapters/oimdb-legacy.ts:1043`), and
`packages/core-legacy/package.json` declares `"version": "3.12.1"` (line 3). The adapter imports
`packages/core-legacy/src` directly (1-22), not a published tarball. The md says the source was
restored from git at `bbfe0a1` (`oimdb-legacy.md`, first section). Whether that tree is byte-equal
to what npm shipped as `@oimdb/core@3.12.1` was **not verified**.

## What the source says and what the adapter does

`docs` names the source as the recipe (1044). `departure` (1045-1054) says the 3.x README's
`updateEventEmitter.subscribeOnKey` does not exist in 3.12.1 (not verified against the README), and
names the two places the churn binding leaves the kit: the collection is built with
`createUpdateEmitter`, which `TOIMCollectionKit`'s options type cannot carry
(`core-legacy/src/types/TOIMCollectionKit.ts:13-16` is plain `TOIMCollectionOptions`; the option
exists only on the `OIMReactiveCollection` constructor, `core/OIMReactiveCollection.ts:57-66`), and
the chain's and diamond's nodes are built on the queue's compute runtime because the kit's scope
cannot release them. Every other binding follows the kit: `createOIMCollectionKit`,
`indexFactory.derivedArrayIndex`, `collection.emitter` and `index.emitter` subscriptions, and
`queue.flush()` as the settle. Renders run on `FRAME_END` so a re-subscription after a shape change
is outside the effect phase (183-202).

`frame` is `run()` in all five bindings (278, 383, 669, 838, 1024). 3.12.1 exports no batch or
transaction call; nothing is delivered until `queue.flush()`, so the writes between two settles are
already one frame.

## Where it differs

1. **The churn collection is not a kit.** `new OIMReactiveCollection(queue, { …, createUpdateEmitter })`
   (327-339).
2. **The chain and diamond are built off the kit's runtime, not through `kit.computed`.** Reason
   above; the alternative would leave every unmounted node in the scope until dispose.
3. **pin is half a pin.** Reads go through held slots; writes still go through `upsertOneByPk`
   (272-277) because `OIMCollection` has no slot-addressed write (`core/OIMCollection.ts:97-150`).
   That is a library limit, stated in the md.

## Is anything done for the library

No values are held outside the engine: `visible` holds the entity objects the bucket's slots point
at, and `readAll`, `groupOrder` and `readPairs` read the collection, the index bucket and the slots.
The chain's and diamond's computeds read the slots through `labelAt` (355-358) and the effects read
the head computed; nothing caches a derived value outside them. `switchGroup` keeps only the key the
view reads, `pagedGroup`.

## Not verified

- Equality of `packages/core-legacy/src` with the published 3.12.1 package.
- That `OIMReactiveCollection<TRow, string, TChurnFieldEmitter>` is accepted by `on.collection`
  (`dx/on.ts:24-28`, which takes `OIMReactiveCollection<TEntity, TPk>`); not compiled.
- churnDiamond and viewSwitch were read against this wiring, not executed.
