---
sidebar_position: 12
title: API reference
description: An index of every name exported by @oimdb/core, grouped by domain, each linked to the page that explains it.
---

# API reference

This page indexes every export of `@oimdb/core`: all 200 names that the package entry point exports, and nothing else. Each entry says what the export is, as read from its source, and links to the section of these docs that explains it. The full typed signatures ship with the package in `node_modules/@oimdb/core/llms.txt`.

## Root and defaults

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMDB` | class | The root: the clock, the collector slot and the default channel slot over them, plus the database-wide entity writer, slot stamp, release policy and index-keys service the factories read; `flush()` flushes the default channel slot. An `IOIMChannelMap`. | [The root: OIMDB](./model.md#the-root-oimdb) |
| `TOIMDBOptions` | type | Options of `OIMDB`: `channelScheduler`, `errorPolicy`, `onBeforeFlush`, `getNowMs`, `releaseTimer`, `entityWriter`, `indexKeysService`, `slotStamp`, `slotReleasePolicy`. | [The root: OIMDB](./model.md#the-root-oimdb) |
| `OIMDefaults` | class | Static `OIMDefaultValue` entries for the process-wide defaults: column slot store service, computed column slot store service, scalar and composite key tree walks, standalone slot owner, entity writer, entity emptiness, index-keys service, store slot listener. | [Building one](./collections.md#building-one) |
| `OIMDefaultValue` | class | One process-wide default: `getValue()` builds it on first read and marks it handed out; `setValue()` replaces it and throws once it was handed out. | [Building one](./collections.md#building-one) |
| `TOIMFactoryOptions` | type | The options shape shared by the collection factories. | [Building one](./collections.md#building-one) |

## Collection services

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMSlotColumnService` | class | Abstract base of both slot services: the column doors `getColumn`, `holdColumn`, `getAnyColumn`, `holdAnyColumn`, `getColumnGroup`, `holdColumnGroup`, `unholdColumn`, over the column owner it is built with. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `OIMSlotCollectionService` | class | The read doors of a keyed collection over a content service: `createStoreSlot(channelMap)`, `createStoreSlotFrom`, `findSlotByKey`, `hasSlotContentByKey`, `getSlotByKey`, `holdSlotByKey`, `getSlots`, `getSlotCount`, `isSameKey`, and the column doors inherited from `OIMSlotColumnService`; `slotContentService` is the content service. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `TOIMSlotCollectionServiceOptions` | type | Constructor options of `OIMSlotCollectionService`: the slot owner, the store service, the content service, the store slot listener. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `createOIMSlotCollectionService` | function | Builds an `OIMSlotCollectionService` over an entity content service (`{ slotContentService }`). | [Building one](./collections.md#building-one) |
| `OIMSingleSlotService` | class | The read doors of a single: `createStoreSlot(channelMap)`, `findSingleSlot`, `hasSingleSlotContent`, `getSingleSlot`, `holdSingleSlot`, the column doors. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMSingleSlotServiceOptions` | type | Constructor options of `OIMSingleSlotService`. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `createOIMSingleSlotService` | function | Builds an `OIMSingleSlotService` over a single entity content service. | [Standalone records](./object.md) |
| `OIMSlotOwnerService` | type only | The slot owner of one collection type: holds, subscriptions, columns and release, over its content strategy, store service, release policy and column owner. Built by the factories. | [When a slot goes](./architecture.md#when-a-slot-goes) |
| `TOIMSlotOwnerServiceOptions` | type | Constructor options of `OIMSlotOwnerService`. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `IOIMSlotContentStrategy` | interface | What a content service tells its slot owner: `createSlot`, `isSlotEmpty`, `releaseSlotContent`, `hasReference`. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `IOIMSlotContentFlushStrategy` | interface | What a content service does when the outermost subframe on its store slot closes. | [The subframe](./channel.md#the-subframe) |
| `IOIMSubframeCloseListener` | interface | `onStoreSlotSubframeClosed(storeSlot)`, called by the outermost `closeSubframe` for a store slot listed with `listChangedStoreSlot`. | [The subframe](./channel.md#the-subframe) |
| `OIMContentChangeListenerService` | class | `INSTANCE`: files and unfiles a content-change listener on a store slot (`addContentChangeListener`, `removeContentChangeListener`) and declares reads without one (`addReadColumn`, `removeReadColumn`, `addReadAnyColumn`, `removeReadAnyColumn`). | [The content-change hook](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `IOIMContentChangeListener` | interface | `onContentChanged(slot, patch, changedColumns)` and `onContentChangedMany(slots, patches, changedColumns)`, told of every write that changed a store slot's content. | [The content-change hook](./oimindex.md#the-content-change-hook-and-indexkeys) |

## Entities and writers

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMSlotContentEntityService` | class | The entity content service: `keyOf`, `slotOwner`, `slotStoreService`; the writes `upsertEntity`, `upsertEntities`, `insertEntity`, `insertEntities`, `fillEntities`, `clearAllEntities`, `writeEntity`, `updateEntity`, `updateEntityColumn`, `deleteEntityColumns`, `markEntityChanged`, `deleteEntity`, `deleteEntities`, and `findEntityByKey`. | [The writes](./writing.md#the-writes) |
| `TOIMSlotContentEntityServiceOptions` | type | Constructor options of `OIMSlotContentEntityService`: `keyOf`, `entityWriter`, `slotEmptiness`, `slotStamp`, `slotReleasePolicy`, `slotStoreService`, the column owner options. | [Building one](./collections.md#building-one) |
| `TOIMEntitySlotOwnerService` | type | The slot owner type of an entity collection. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `TOIMSlotContentEntityServiceFactoryOptions` | type | The options `createOIMSlotContentEntityService`, `createOIMEntityService` and `createOIMSingleEntityService` share: `entityWriter`, `slotEmptiness`, `slotReleasePolicy`, `columnSlotStoreService`, `columnNames`. | [Building one](./collections.md#building-one) |
| `createOIMSlotContentEntityService` | function | Builds an `OIMSlotContentEntityService` and its slot owner on an `OIMDB`; a Map store unless `slotStoreService` is passed, and no `keyOf` for a single. | [Building one](./collections.md#building-one) |
| `createOIMEntityService` | function | Convenience wrapper: an `OIMSlotCollectionService` over a fresh entity content service with a Map store. | [Building one](./collections.md#building-one) |
| `createOIMSingleEntityService` | function | Convenience wrapper: an `OIMSingleSlotService` over a single entity content service. | [Standalone records](./object.md) |
| `TOIMEntitySlot` | type | An indexable slot that carries an entity (or nothing) and its data. | [A slot](./architecture.md#a-slot) |
| `TOIMEntityColumnName` | type | The string column names of an entity type, or any string when the entity type is a bare object. | [Writing a standalone record](./writing.md#writing-a-standalone-record) |
| `TOIMEntityColumnValue` | type | The value type of one column of an entity type, or unknown when the entity type is a bare object. | [useOIMField — one field of one identity](../packages/react.md#useoimfield--one-field-of-one-identity) |
| `IOIMEntityWriter` | interface | The six functions that write an entity slot: fill, put, patch, patch one column, delete columns, clear. | [The two writers](./writing.md#the-two-writers) |
| `createOIMEntityWriterInPlace` | function | Builds an `IOIMEntityWriter` that applies puts, patches and column deletes onto the stored entity object itself. | [The two writers](./writing.md#the-two-writers) |
| `createOIMEntityWriterReplacing` | function | Builds an `IOIMEntityWriter` that applies every change to a fresh copy and stores the copy in the slot. | [The two writers](./writing.md#the-two-writers) |
| `TOIMEntityWriterOptions` | type | Options of both writer factories: `sameValueGuard`, `entityInsertStrategy`, and the walks `putEntityColumns`, `patchEntityColumns`, `patchEntityColumn`. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `TOIMEntityInsertStrategy` | type | The function that stores a handed entity into an entity slot on fill. | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimInsertEntityWithoutCopy` | function | Insert strategy that stores the handed entity object itself. The default. | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimInsertEntityWithCopy` | function | Insert strategy that stores a copy (`{ ...entity }`). | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimInsertEntityWithSanitizedCopy` | function | Insert strategy that stores a copy with an own `__proto__` key removed; for untrusted JSON. | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimPatchEntityColumns` | function | The PATCH walk, the writers' default `patchEntityColumns`: writes the moved columns into the object `targetOf` hands back and returns it, or `undefined` when nothing moved. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimPatchEntityColumnsGuarded` | function | The PATCH walk that skips a `__proto__` key and a key the patch does not own. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimPatchEntityColumn` | function | The one-column walk, the writers' default `patchEntityColumn`. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimPatchEntityColumnGuarded` | function | The one-column walk that refuses the column name `__proto__`. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimPutEntityColumns` | function | The PUT walk, the writers' default `putEntityColumns`: the patch walk plus `undefined` over every column the new value lacks. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimPutEntityColumnsGuarded` | function | The PUT walk that skips `__proto__` keys and inherited stored columns. | [Writing your own writer](./writing.md#writing-your-own-writer) |

## Buckets and bucket commands

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMSlotContentBucketService` | abstract class | The bucket content service every strategy extends: `writeBucketMemberSlots`, `addBucketMemberSlot(s)`, `removeBucketMemberSlot(s)`, `clearBucketMemberSlots`, `fillBucketMemberSlots`, `markContentChanged`, `markBucketColumnsChanged`, `getBucketMemberSlots`, `getBucketMemberSlotCount`, `hasBucketMemberSlot`. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |
| `OIMSlotContentBucketServiceSetDriven` | class | Bucket content service over a `Set`; no positions. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |
| `OIMSlotContentBucketServiceArrayBased` | abstract class | The array-based bucket content services: the positional reads `getBucketMemberSlotAt`, `getBucketMemberSlotPosition`. | [The doors](./indexes.md#the-doors) |
| `OIMSlotContentBucketServiceArrayDriven` | class | Bucket content service over an array whose positions are the caller's: the five positional writes; `bucketArrayMembership` option. | [Positions the caller decides](./indexes.md#positions-the-caller-decides) |
| `OIMSlotContentBucketServiceSortedArrayDriven` | class | Bucket content service whose array is kept sorted; `repositionBucketMemberSlot`; no positional writes. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMSlotContentBucketServiceOptions` | type | Options of the bucket content services: `bucketCommands`. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `TOIMSlotContentBucketServiceSortedArrayDrivenOptions` | type | Options of the sorted bucket content service: `compareBucketMemberSlots`. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMBucketSlotOwnerService` | type | The slot owner type of a bucket collection. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `createOIMBucketService` | function | Builds a bucket collection on an `OIMDB`: array-driven with an `OIMBucketCommands` unless `slotContentService` is passed; a Map store unless `bucketSlotStoreService` is passed. | [Building one](./indexes.md#building-one) |
| `createOIMSingleBucketService` | function | Builds a single bucket collection, an `OIMSingleSlotService` over a bucket content service. | [A single bucket](./indexes.md#a-single-bucket) |
| `TOIMBucketCollectionFactoryArguments` | type | The argument list of the bucket factories: the options are required, with a `bucketSlotStoreService`, when the key is an array. | [Building one](./indexes.md#building-one) |
| `OIMBucketCommands` | class | Records ordered-list commands on bucket slots written in the current frame, capped per slot, and clears them after each flush. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `TOIMBucketCommandsOptions` | type | Options of `OIMBucketCommands`: `maxCommandsPerSlot`. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `IOIMBucketCommands` | interface | The recorder a bucket content service reports positional writes to: `recordInsert`, `recordRemove`, `recordMove`, `recordWholeList`. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `TOIMOrderedListCommand` | type | One ordered-list command: insert, remove, move, or reset to a whole list. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `oimOrderedListCommandsOfTransition` | function | Computes the ordered-list commands that turn one slot sequence into another, optionally capped. | [Rendering an ordered bucket](./indexes.md#rendering-an-ordered-bucket) |
| `TOIMBucketSlot` | type | An indexable slot that carries a bucket's member store, its owner, the commands recorded on it, and `isWholeListRecorded`. | [A slot](./architecture.md#a-slot) |
| `IOIMBucketArrayMembership` | interface | What an array bucket records per mention: `createStore`, `addSlot`, `removeSlot`, `hasSlot`, `clearSlots`, `containsTheSameSequence`. | [And what naming a slot records](./indexes.md#and-what-naming-a-slot-records-the-membership) |
| `OIMBucketArrayMembershipNonUnique` | class | `INSTANCE`: one entry per mention. The default. | [And what naming a slot records](./indexes.md#and-what-naming-a-slot-records-the-membership) |
| `OIMBucketArrayMembershipUnique` | class | One entry per slot, kept in a `Set` beside the list. | [And what naming a slot records](./indexes.md#and-what-naming-a-slot-records-the-membership) |
| `TOIMBucketSlotsSetStore` | type | The member store of a set-driven bucket. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |
| `TOIMBucketSlotsArrayStore` | type | The member store of an array-driven bucket: `{ bucketMemberSlots }`. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |
| `TOIMBucketSlotsArrayUniqueStore` | type | The array store plus the `Set` of the unique membership. | [And what naming a slot records](./indexes.md#and-what-naming-a-slot-records-the-membership) |
| `TOIMBucketSlotsSortedArrayStore` | type | The array store plus the count of its sorted prefix. | [Sorted at write](./oimindex.md#sorted-at-write) |

## Indexes

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMIndexService` | class | A collection service of buckets filled from an entity store slot by `keyOf`: `createIndexStoreSlot`, `disposeIndexStoreSlot`, `getEntitiesByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, the bucket column doors; its `slotContentService` is typed to the reads. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `OIMIndexServiceSortedArrayDriven` | class | `OIMIndexService` over a sorted bucket content service, re-filing a member when one of its sort columns changes. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMIndexServiceOptions` | type | Constructor options of `OIMIndexService`: the collection options plus `keyOf`, `columns`, `sourceSlotCollectionService`, `indexKeysService`. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `TOIMIndexStoreSlot` | type | An index's store slot: a store slot of buckets with its `sourceStoreSlot`, its listener, `indexKeysPosition` and `isDisposed`. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `TOIMIndexServiceStoreSlot` | type | The index store slot type of a given `OIMIndexService`. | [Ordering](./oimindex.md#ordering) |
| `TOIMIndexServiceFactoryOptions` | type | The options every index factory shares: `entityService` (anything with `getSlots`), `slotReleasePolicy`, `columnSlotStoreService`, `columnNames`. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `createOIMIndexService` | function | Builds an index on an `OIMDB` over an entity collection service; array-driven buckets without commands unless `slotContentService` is passed. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `createOIMIndexServiceByCompositeKey` | function | Builds an index keyed by the tuple of several columns, over a tree-driven bucket store. | [A key of several columns](./oimindex.md#a-key-of-several-columns) |
| `createOIMIndexServiceSortedArrayDriven` | function | Builds an `OIMIndexServiceSortedArrayDriven` sorted by `sortColumns`. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMIndexKeyOptions` | type | `{ columns }`, `{ keyOf }` or both: where an index key comes from. | [Where the key comes from](./oimindex.md#where-the-key-comes-from-columns-keyof-or-both) |
| `TOIMIndexKey` | type | The key type an index derives from its `columns`: one column's value, or a tuple of several. | [A key of several columns](./oimindex.md#a-key-of-several-columns) |
| `IOIMIndexKeysService` | interface | How the per-index key cells on a slot are allocated, read, written and reclaimed. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `TOIMIndexKeysPositions` | type | The positions allocated on one source store slot. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `OIMIndexKeysService` | abstract class | Base of the two index-keys strategies. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `OIMIndexKeysServiceAppending` | class | Never reuses a position. The default. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `OIMIndexKeysServiceReclaiming` | class | Wipes and reuses a position at `disposeIndexStoreSlot`. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |

## Computed

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMComputedService` | class | A computed collection type: `computedCollectionService` and `createComputedStoreSlot(channelMap, derive?, createSources?)`. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `TOIMComputedServiceOptions` | type | Constructor options of `OIMComputedService`. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `createOIMComputedService` | function | Builds an `OIMComputedService`; takes no db. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `TOIMComputedStoreSlot` | type | A computed store slot: a store slot with its `derive` and `createSources`. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `OIMComputedServiceSorted` | class | Per key of an index store slot, that bucket's entity slots sorted: `computedCollectionService`, `createSortedStoreSlot(indexStoreSlot)`. | [Ordering](./oimindex.md#ordering) |
| `TOIMComputedServiceSortedOptions` | type | Constructor options of `OIMComputedServiceSorted`. | [Ordering](./oimindex.md#ordering) |
| `TOIMSortedComputedSlot` | type | The computed slot of a sorted list. | [Ordering](./oimindex.md#ordering) |
| `createOIMComputedServiceSorted` | function | Builds an `OIMComputedServiceSorted` over an index service; takes no db. | [Ordering](./oimindex.md#ordering) |
| `OIMComputedServiceBucketMemo` | class | Per key of a bucket store slot, the bucket's member slots as an array kept by identity: `computedCollectionService`, `createBucketMemoStoreSlot(bucketStoreSlot)`. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `TOIMComputedServiceBucketMemoOptions` | type | Constructor options of `OIMComputedServiceBucketMemo`. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `TOIMBucketMemoComputedSlot` | type | The computed slot of a bucket memo. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `createOIMComputedServiceBucketMemo` | function | Builds an `OIMComputedServiceBucketMemo` over a bucket collection service; takes no db. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `TOIMComputedSlot` | type | A slot whose value is derived, with its value service, sources and stamps. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `TOIMComputedSources` | type | `{ sourceSlots, sourceComputeds }`, what `createSources` returns. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `IOIMComputedValueService` | interface | `getValueForSlot(computedSlot)`, the one read that settles a computed. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `OIMComputedValueService` | class | The value service of a computed collection: holds the `sameValueGuard` and serves the value. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `TOIMComputedValueServiceOptions` | type | Constructor options of `OIMComputedValueService`. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `oimRefreshSourceComputeds` | function | Brings every computed of a list current; a binding read outside an effect calls it before its derive. | [Reading a computed from an effect](./reading-subscribing.md#reading-a-computed-from-an-effect) |
| `TOIMDerivation` | type | What a computed slot and an effect share: their sources and the stamp of their last run. | [Why a computed is pulled](./computed-effects.md#why-a-computed-is-pulled) |
| `TOIMSortColumn` | type | `{ column, direction }`, one sort column. | [Ordering](./oimindex.md#ordering) |
| `TOIMSortableColumnName` | type | A column whose values are strings, numbers or bigints. | [Ordering](./oimindex.md#ordering) |
| `oimColumnsComparator` | function | The comparator over sort columns: each in turn, by its direction, an undefined or null value last. | [Ordering](./oimindex.md#ordering) |

## Columns

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `TOIMColumnSlot` | type | A slot for one column of a carrier slot, keyed by the column name. | [Column slots](./collections.md#column-slots) |
| `TOIMComputedColumnSlot` | type | `TOIMComputedSlot<unknown, string>`: the column slot of a computed. | [Computed columns](./computed-effects.md#computed-columns) |
| `TOIMColumnGroup` | type | A named set of columns (`key`, `columnNames`) handed out by `getColumnGroup`. | [Column groups](./collections.md#column-groups) |
| `TOIMColumnReaders` | type | What is kept per column name: whether a single-column slot exists and which column groups name it. | [Column slots](./collections.md#column-slots) |
| `OIMColumnOwner` | abstract class | The owner of a carrier's column slots; an `OIMSlotOwner` that mints, holds and releases them. | [Column slots](./collections.md#column-slots) |
| `OIMColumnOwnerPushDriven` | type only | Column owner whose column slots are plain slots woken by marks on a write; entity and bucket collections. | [Column slots](./collections.md#column-slots) |
| `OIMColumnOwnerPullDriven` | class | Column owner whose column slots are computed slots over the carrier; computed collections. | [Computed columns](./computed-effects.md#computed-columns) |
| `TOIMColumnOwnerOptions` | type | Either `columnSlotStoreService` or `columnNames` (the ordinal store over those names). | [Naming the columns up front](./collections.md#naming-the-columns-up-front) |

## Channel, effects and scheduling

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMChannelService` | class | `INSTANCE`: runs a channel slot — `write`, `writeWithoutFlushCheck`, `flush`, `openSubframe`, `closeSubframe`, `isSubframeOpen`, `listChangedStoreSlot`, `subscribeAfterEachFrame`, `subscribeOnceAfterFrame`, `subscribeAfterEachFlush`, `isChangedInCurrentFrame`, `assertNotFlushing`, `dropChannelSlot`. | [The channel](./channel.md) |
| `TOIMChannelSlot` | type | The channel's state: clock, frame, effect queue, subframe counters, handlers, collector slot. | [The channel](./channel.md) |
| `TOIMChannelSlotOptions` | type | Options of `createOIMChannelSlot`. | [The channel](./channel.md) |
| `createOIMChannelSlot` | function | Builds a channel slot over a clock and a collector slot. | [The channel](./channel.md) |
| `IOIMChannelMap` | interface | `{ defaultChannelSlot }`, what `createStoreSlot` and the effect doors take; `OIMDB` is one. | [Every collection has a channel](./model.md#every-collection-has-a-channel) |
| `TOIMChannelFrame` | type | The frame of a channel slot: whether it runs, the clock it opened at, the after-frame handlers. | [The clock](./channel.md#the-clock) |
| `TOIMChannelClock` | type | `{ revision, epoch }`. | [The clock](./channel.md#the-clock) |
| `TOIMChannelScheduler` | type | `(flush) => void`, what defers a flush. | [Schedulers](./channel.md#schedulers) |
| `OIMChannelQueue` | type only | The reusable queue the channel and the services batch with: `getEntryCount`, `getEntryAt`. | [The content-change hook](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `oimIsAnySlotChangedAfter` | function | Answers whether any slot of a list changed after a clock reading, given as a revision and an epoch. | [The clock](./channel.md#the-clock) |
| `IOIMErrorPolicy` | interface | `onErrorCaught(error)`, what a throw caught during a flush becomes. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `OIMErrorPolicyLogAndContinue` | class | Logs the throw, hands it to `onError`, and goes on. The default. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `TOIMErrorPolicyLogAndContinueOptions` | type | `{ onError }`. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `OIMErrorPolicyThrowAtOnce` | class | Throws the first throw out of `flush()`. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `OIMEffectService` | class | `INSTANCE`: `createEffect`, `createEffectImmediate`, `subscribeEffect`, `createEffectWithSourceTracking`, `disposeEffect`, each taking the channel map first. | [Effects](./computed-effects.md#effects) |
| `IOIMEffectService` | interface | What an effect carries as its service. | [Effects](./computed-effects.md#effects) |
| `TOIMEffect` | type | A plain effect object; built only by the effect service. | [Subscribing is building an effect](./reading-subscribing.md#subscribing-is-building-an-effect) |
| `TOIMEffectBody` | type | `() => (() => void) \| void`; a returned function is the undo. | [A body may hand back its own undo](./reading-subscribing.md#a-body-may-hand-back-its-own-undo) |
| `TOIMEffectBodyWithSourceTracking` | type | The body of a tracked effect, handed an `OIMEffectSourceTracker`. | [An effect that finds its sources as it reads](./computed-effects.md#an-effect-that-finds-its-sources-as-it-reads) |
| `OIMEffectSourceTracker` | type only | `readSourceSlot`, `readSourceComputedValue`: what a tracked body reads through. | [An effect that finds its sources as it reads](./computed-effects.md#an-effect-that-finds-its-sources-as-it-reads) |
| `OIMFlushSchedulerService` | abstract class | The base of what a timer fires: the schedule and cancel of one standing callback on a `TOIMFlushSchedulerSlot`. | [Source layout](./architecture.md#source-layout) |
| `TOIMFlushSchedulerSlot` | type | `{ timer, scheduledCallback, timerDisposer }`. | [Source layout](./architecture.md#source-layout) |
| `TOIMTimer` | type | `(run, inMs) => TOIMDisposer`, how a host schedules a timed run. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `TOIMDisposer` | type | `() => void`. | [Giving many handles back at once](./reading-subscribing.md#giving-many-handles-back-at-once) |

## Release policies and collectors

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `IOIMSlotReleasePolicy` | interface | Whether and when an unheld slot may go. | [The question a policy answers](./lifecycle.md#the-question-a-policy-answers) |
| `OIMSlotReleasePolicyAtEmpty` | class | `INSTANCE`: an empty unheld slot goes; a filled one stays. The default of entity, bucket and index collections. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotReleasePolicyNever` | class | `INSTANCE`: nothing goes. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotReleasePolicyAtUnhold` | class | `INSTANCE`: an unheld slot goes, value or not. The default of computeds. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotReleasePolicyAfterWrite` | class | A slot goes once its last write is older than `keepAfterWriteMs`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `TOIMSlotReleasePolicyAfterWriteOptions` | type | `{ keepAfterWriteMs }`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotReleasePolicyAfterIdle` | class | A slot goes once nothing has watched it for `keepAfterIdleMs`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `TOIMSlotReleasePolicyAfterIdleOptions` | type | `{ keepAfterIdleMs }`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotReleasePolicyAfterUnhold` | class | A slot goes once `keepAfterUnholdMs` has passed since its last unhold. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `TOIMSlotReleasePolicyAfterUnholdOptions` | type | `{ keepAfterUnholdMs }`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotReleasePolicyEarliest` | class | As soon as any of several policies says so. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMUnusedSlotCollectorService` | class | `INSTANCE`: holds what a getter minted until the next flush; `holdSlotUntilFlush`, `flush`, `open`, `close`, `run`. | [The unused-slot collector](./reading-subscribing.md#the-unused-slot-collector) |
| `TOIMUnusedSlotCollectorSlot` | type | The unused-slot collector's state. | [The unused-slot collector](./reading-subscribing.md#the-unused-slot-collector) |
| `createOIMUnusedSlotCollectorSlot` | function | Builds an unused-slot collector slot of your own. | [The unused-slot collector](./reading-subscribing.md#the-unused-slot-collector) |
| `TOIMCollectorSlot` | type | The db's collector slots: the unused-slot collector and the three release collectors. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `TOIMCollectorSlotOptions` | type | `{ getNowMs, releaseTimer, errorPolicy }`. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `createOIMCollectorSlot` | function | Builds a collector slot. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `OIMReleaseSlotCollectorService` | abstract class | Sweeps the slots whose marker has come due: `flush`, `cancelAllSlotReleases`, `isSlotReleasable`, `markSlotReleaseDue`. | [The collectors](./architecture.md#the-collectors) |
| `OIMReleaseSlotCollectorServiceAfterWrite` | class | `INSTANCE`: reads `releaseDueAfterWriteMs`. | [What restarts each window](./lifecycle.md#what-restarts-each-window) |
| `OIMReleaseSlotCollectorServiceAfterIdle` | class | `INSTANCE`: reads `releaseDueAfterIdleMs`. | [What restarts each window](./lifecycle.md#what-restarts-each-window) |
| `OIMReleaseSlotCollectorServiceAfterUnhold` | class | `INSTANCE`: reads `releaseDueAfterUnholdMs`. | [What restarts each window](./lifecycle.md#what-restarts-each-window) |
| `TOIMReleaseSlotCollectorSlot` | type | One release collector's state: its queue and its scheduled run. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `createOIMReleaseSlotCollectorSlot` | function | Builds a release collector slot. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `OIMReleaseSlotQueueService` | class | `INSTANCE`: files slots into slices of `OIM_SLICE_LENGTH_MS` and releases the due slices. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `oimSliceOfMs` | function | The number of the time slice a millisecond timestamp falls in. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `OIM_SLICE_LENGTH_MS` | const | Length of one release time slice: 1024 ms. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |

## Slot stores and keys

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `TOIMStoreKey` | type | A scalar key: a string or a number. | [Scalar keys](./collections.md#scalar-keys) |
| `IOIMSlotStoreService` | interface | Stateless service over a keyed slot store: create, own a key, compare keys, get, set, remove, iterate, size. | [How a collection is keyed is the store's business](./collections.md#how-a-collection-is-keyed-is-the-stores-business) |
| `OIMSlotStoreServiceMapDriven` | class | `IOIMSlotStoreService` over a Map. | [Building one](./collections.md#building-one) |
| `OIMSlotStoreServiceTreeDriven` | class | `IOIMSlotStoreService` keyed by a composite key, filed in a tree walked by a key tree walk. | [Composite keys come in two strategies](./collections.md#composite-keys-come-in-two-strategies-and-you-pick-one) |
| `OIMSlotStoreServiceSingleSlotDriven` | class | `INSTANCE`: keyed by `void`, files at most one slot; the store service of every single. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMSingleSlotStore` | type | The store of a single: `{ slot }`. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMDefaultSlotStore` | type | The store a collection gets when its `TStore` is not named: `TOIMSingleSlotStore<TSlot>` for a `void` key, `Map<TKey, TSlot>` otherwise. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMSlotStoreTree` | type | The tree store: a root key node and the set of filed slots. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `IOIMKeyTreeWalk` | interface | Walks a composite key through a tree of key nodes: mint the node, find it, prune it. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `OIMKeyTreeWalk` | abstract class | Base of the key tree walks. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `OIMKeyTreeWalkScalar` | class | Key tree walk over scalar key parts, which holds nothing. | [A chain of values](./collections.md#a-chain-of-values) |
| `OIMKeyTreeWalkComposite` | class | Key tree walk over entity-slot key parts, which holds each part while the edge stands. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `TOIMCompositeKeyNode` | type | One node of the key tree. | [A chain of identities](./collections.md#a-chain-of-identities) |

## Slots and owners

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `TOIMSlot` | type | The base slot: effects and their edges, change stamps, hold count, three release-due times, `slotFlags`, column slot store, `storeSlot`, owner. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMKeyedSlot` | type | `TOIMSlot` with a key. | [A slot](./architecture.md#a-slot) |
| `TOIMIndexableSlot` | type | `TOIMKeyedSlot` with index-key cells. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `TOIMSlotEditable` | type | The same type with every field writable. | [A slot](./architecture.md#a-slot) |
| `TOIMStoreSlot` | type | A store slot: one collection's state — `store`, `channelSlot`, listeners, column state. Not a slot. | [A slot](./architecture.md#a-slot) |
| `TOIMSingleSlotStoreSlot` | type | The store slot of a single. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `IOIMStoreSlotListener` | interface | Told of every store slot created; set as `OIMDefaults.STORE_SLOT_LISTENER` before the first collection is built. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `OIMStoreSlotListenerNone` | class | The default store slot listener: hears nothing. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `oimIsSlotEmpty` | function | Reads the EMPTY bit of `slot.slotFlags`. | [A slot](./architecture.md#a-slot) |
| `oimIsSlotReleased` | function | Reads the RELEASED bit of `slot.slotFlags`. | [A slot](./architecture.md#a-slot) |
| `OIMSlotOwner` | class | Base slot owner: hold and unhold counting, subscribing and unsubscribing an effect, the refusal on a released slot. | [Who holds](./architecture.md#who-holds) |
| `IOIMSlotOwner` | interface | What every slot's owner answers: hold, unhold, release if unheld, subscribe, unsubscribe. | [A slot goes when nothing refers to it](./model.md#a-slot-goes-when-nothing-refers-to-it) |
| `IOIMSlotEmptiness` | interface | The strategy that answers whether a slot counts as empty. | [Emptiness is a strategy](./collections.md#emptiness-is-a-strategy) |
| `IOIMSlotStamp` | interface | A strategy that stamps a slot each time its emptiness is settled. | [The root: OIMDB](./model.md#the-root-oimdb) |
| `TOIMSameValueGuard` | type | `(prev, next) => boolean`, whether a value moved. | [sameValueGuard](./writing.md#samevalueguard) |

## Utilities and constants

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `oimSameValueZeroGuard` | function | Same-value guard by SameValueZero. | [sameValueGuard](./writing.md#samevalueguard) |
| `oimSameSlotSequence` | function | Whether two slot arrays hold the same slots in the same order. | [Comparing two chains](./collections.md#comparing-two-chains) |
| `oimSameKeySequence` | function | Whether two key arrays hold the same keys in the same order, by SameValueZero. | [Comparing two chains](./collections.md#comparing-two-chains) |
| `oimHoldSlots` | function | Takes one hold on each slot of a list, through that slot's owner. | [Holding what you subscribe to](./reading-subscribing.md#holding-what-you-subscribe-to) |
| `oimUnholdSlotsIfAlive` | function | Gives back one hold on each slot of a list, skipping a slot that was released meanwhile. | [Who holds](./architecture.md#who-holds) |
| `OIM_NOTHING_WAS_INSERTED` | const | -1: an insert that inserted nothing. | [The doors](./indexes.md#the-doors) |
| `OIM_NOTHING_WAS_REMOVED` | const | -1: a remove that removed nothing. | [The doors](./indexes.md#the-doors) |
| `OIM_REMOVED_WITHOUT_A_POSITION` | const | -2: a remove from a store that has no positions. | [The doors](./indexes.md#the-doors) |
| `OIM_FROZEN_EMPTY_SLOTS` | const | A frozen empty array, the initial value of the bucket memo and sorted computeds. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
