---
sidebar_position: 12
title: API reference
description: An index of every name exported by @oimdb/core, grouped by domain, each linked to the page that explains it.
---

# API reference

This page indexes every export of `@oimdb/core`: all 229 names that the package entry point exports, and nothing else. Each entry says what the export is, as read from its source, and links to the section of these docs that explains it. The full typed signatures ship with the package in `node_modules/@oimdb/core/llms.txt`.

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
| `OIMColumnSlotService` | class | Abstract base of both slot services: the column doors `getColumn`, `holdColumn`, `getAnyColumn`, `holdAnyColumn`, `getColumnGroup`, `holdColumnGroup`, `unholdColumn`, over the column owner it is built with. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `OIMSlotCollectionService` | class | The read doors of a keyed collection over a content service: `createStoreSlot(channelMap)`, `createStoreSlotFrom`, `findSlotByKey`, `hasSlotContentByKey`, `getSlotByKey`, `holdSlotByKey`, `getSlots`, `getSlotCount`, `isSameKey`, and the column doors inherited from `OIMColumnSlotService`; `slotContentService` is the content service. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `TOIMSlotCollectionServiceOptions` | type | Constructor options of `OIMSlotCollectionService`: the slot owner, the store service, the content service, the store slot listener. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `createOIMSlotCollectionService` | function | Builds an `OIMWritableSlotCollectionService` over a keyed content service (entity or bucket): `{ slotContentService, slotStoreService?, … }`. | [Building one](./collections.md#building-one) |
| `OIMWritableSlotCollectionService` | class | What `createOIMSlotCollectionService` returns: an `OIMSlotCollectionService` plus `writeSlotContentByKey(storeSlot, key, content, changedSlots?)`. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `OIMSingleSlotService` | class | The read doors of a single: `createStoreSlot(channelMap)`, `findSingleSlot`, `hasSingleSlotContent`, `getSingleSlot`, `holdSingleSlot`, the column doors. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMSingleSlotServiceOptions` | type | Constructor options of `OIMSingleSlotService`. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `createOIMSingleSlotService` | function | Builds an `OIMWritableSingleSlotService` over a content service with `createSingleSlot` (entity or bucket). | [Standalone records](./object.md) |
| `OIMWritableSingleSlotService` | class | What `createOIMSingleSlotService` returns: an `OIMSingleSlotService` plus `writeSingleSlotContent(storeSlot, content, changedSlots?)` and `clearSingleSlotContent(storeSlot)`. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `OIMSlotOwnerService` | type only | The slot owner of one collection type: holds, subscriptions, columns and release, over its content service, store service, release policy and column owner. Built by the factories. | [When a slot goes](./architecture.md#when-a-slot-goes) |
| `TOIMSlotOwnerServiceOptions` | type | Constructor options of `OIMSlotOwnerService`. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `IOIMSlotContentService` | interface | What a content service answers its slot owner: `isSlotEmpty`, `releaseSlotContent`, `hasReference`. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `IOIMSlotContentWriter` | interface | The content writes a collection drives: `insertSlotContent`, `writeSlotContent`, `clearSlotContent`. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `IOIMKeyedSlotCreator` | interface | `createSlot(key, storeSlot, slotOwner)`: what makes a content service usable by `createOIMSlotCollectionService`. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `IOIMSingleSlotCreator` | interface | `createSingleSlot(storeSlot, slotOwner)`: what makes a content service usable by `createOIMSingleSlotService`. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `IOIMSlotFilingService` | interface | Files a minted slot in its store slot. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `TOIMSlotContentServiceKey` | type | The key type `createOIMSlotCollectionService` reads off a content service. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `TOIMSlotContentServiceSlot` | type | The keyed slot type it reads off a content service. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `TOIMSlotContentServiceSingleSlot` | type | The single slot type `createOIMSingleSlotService` reads off a content service. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `TOIMSlotContentServiceContent` | type | The content type a content service writes. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `TOIMSlotContentServicePatch` | type | The patch type of a content service: the content itself for an array, `Partial` of it otherwise. | [Every collection is a content service, a collection service and a store slot](./model.md#every-collection-is-a-content-service-a-collection-service-and-a-store-slot) |
| `OIMSlotContentChangeListenerService` | class | `INSTANCE`: files and unfiles a content-change listener on a store slot (`addContentChangeListener`, `removeContentChangeListener`) and declares reads without one (`addReadColumn`, `removeReadColumn`, `addReadAnyColumn`, `removeReadAnyColumn`). | [The content-change hook](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `IOIMSlotContentChangeListener` | interface | `onContentChanged(slot, patch, changedColumns)` and `onManyContentsChanged(slots, patches, changedColumns)`, told of every write that changed a store slot's content. | [The content-change hook](./oimindex.md#the-content-change-hook-and-indexkeys) |

## Entities and writers

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMSlotContentEntityService` | class | The entity content service: the slot writes `writeSlotContent`, `updateEntity`, `updateEntityColumn`, `deleteEntityColumns`, `markEntityChanged`, `clearSlotContent`; `createSlot`, `createSingleSlot`, `insertSlotContent`, `isSlotEmpty`, `hasReference` and `releaseSlotContent` for the collection service and the slot owner. | [The writes](./writing.md#the-writes) |
| `TOIMSlotContentEntityServiceOptions` | type | Constructor options of `OIMSlotContentEntityService`: `keyOf`, `entityWriter`, `slotEmptinessPolicy`, `slotStamp`, `slotReleasePolicy`, `slotStoreService`, the column owner options. | [Building one](./collections.md#building-one) |
| `TOIMEntitySlotOwnerService` | type | The slot owner type of an entity collection. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `createOIMSlotContentEntityService` | function | Builds an `OIMSlotContentEntityService` and its slot owner on an `OIMDB`; a Map store unless `slotStoreService` is passed, and no `keyOf` for a single. | [Building one](./collections.md#building-one) |
| `TOIMEntitySlot` | type | An indexable slot that carries an entity (or nothing) and its data. | [A slot](./architecture.md#a-slot) |
| `TOIMEntityContentSlot` | type | An entity slot without a key: what a single holds and what the writer and content service take. | [Writing](./writing.md) |
| `TOIMEntityColumnName` | type | The string column names of an entity type, or any string when the entity type is a bare object. | [Writing a standalone record](./writing.md#writing-a-standalone-record) |
| `TOIMEntityColumnValue` | type | The value type of one column of an entity type, or unknown when the entity type is a bare object. | [useOIMField — one field of one identity](../packages/react.md#useoimfield--one-field-of-one-identity) |
| `IOIMEntityWriter` | interface | The six functions that write an entity slot: fill, put, patch, patch one column, delete columns, clear. | [The two writers](./writing.md#the-two-writers) |
| `createOIMInPlaceEntityWriter` | function | Builds an `IOIMEntityWriter` that applies puts, patches and column deletes onto the stored entity object itself. | [The two writers](./writing.md#the-two-writers) |
| `createOIMReplacingEntityWriter` | function | Builds an `IOIMEntityWriter` that applies every change to a fresh copy and stores the copy in the slot. | [The two writers](./writing.md#the-two-writers) |
| `TOIMEntityWriterOptions` | type | Options of both writer factories: `sameValueGuard`, `entityInserter`, and the walks `putEntityColumns`, `patchEntityColumns`, `patchEntityColumn`. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `TOIMEntityInserter` | type | The function that stores a handed entity into an entity slot on fill. | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimInsertEntityWithoutCopy` | function | Insert strategy that stores the handed entity object itself. The default. | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimInsertEntityWithCopy` | function | Insert strategy that stores a copy (`{ ...entity }`). | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimInsertEntityWithSanitizedCopy` | function | Insert strategy that stores a copy with an own `__proto__` key removed; for untrusted JSON. | [The store keeps the object you insert](./writing.md#the-store-keeps-the-object-you-insert) |
| `oimPatchEntityColumns` | function | The PATCH walk, the writers' default `patchEntityColumns`: writes the moved columns into the object `targetOf` hands back and returns it, or `undefined` when nothing moved. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimGuardedPatchEntityColumns` | function | The PATCH walk that skips a `__proto__` key and a key the patch does not own. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimPatchEntityColumn` | function | The one-column walk, the writers' default `patchEntityColumn`. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimGuardedPatchEntityColumn` | function | The one-column walk that refuses the column name `__proto__`. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimPutEntityColumns` | function | The PUT walk, the writers' default `putEntityColumns`: the patch walk plus `undefined` over every column the new value lacks. | [Writing your own writer](./writing.md#writing-your-own-writer) |
| `oimGuardedPutEntityColumns` | function | The PUT walk that skips `__proto__` keys and inherited stored columns. | [Writing your own writer](./writing.md#writing-your-own-writer) |

## Buckets and bucket commands

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMSlotContentBucketService` | abstract class | The bucket content service every strategy extends: `writeSlotContent`, `addBucketMemberSlot(s)`, `removeBucketMemberSlot(s)`, `clearSlotContent`, `fillBucketMemberSlots`, `markContentChanged`, `markBucketColumnsChanged`, `getBucketMemberSlots`, `getBucketMemberSlotCount`, `hasBucketMemberSlot`. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |
| `OIMSlotContentSetBucketService` | class | Bucket content service over a `Set`; no positions. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |
| `OIMSlotContentArrayBucketService` | abstract class | The array-based bucket content services: the positional reads `getBucketMemberSlotAt`, `getBucketMemberSlotPosition`. | [The doors](./indexes.md#the-doors) |
| `OIMSlotContentPositionalArrayBucketService` | class | Bucket content service over an array whose positions are the caller's: the five positional writes; one entry per mention. | [Positions the caller decides](./indexes.md#positions-the-caller-decides) |
| `OIMBucketUniqueMemberSlotsArrayService` | class | The array-driven service with one entry per slot: the list and a `Set` beside it, both written by every write. | [And what naming a slot records](./indexes.md#and-what-naming-a-slot-records-one-per-mention-or-one-per-slot) |
| `OIMSlotContentSortedArrayBucketService` | class | Bucket content service whose array is kept sorted; `repositionBucketMemberSlot`; no positional writes. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMSlotContentBucketServiceOptions` | type | Options of the bucket content services: `bucketCommands`. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `TOIMSlotContentSortedArrayBucketServiceOptions` | type | Options of the sorted bucket content service: `compareBucketMemberSlots`. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMSlotContentArrayBucketServiceOptions` | type | Options of the array bucket content services: `bucketCommands?`, `bucketMemberSlotsArrayService?`. | [Buckets](./indexes.md) |
| `TOIMBucketSlotOwnerService` | type | The slot owner type of a bucket collection. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `OIMBucketCommands` | class | Records ordered-list commands on bucket slots written in the current frame, capped per slot, and clears them after each flush. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `IOIMBucketMemberSlotsArrayService` | interface | The only writer of an array bucket's member list and the `Set` beside it. | [Buckets](./indexes.md) |
| `OIMBucketMemberSlotsArrayService` | class | Keeps every mention; the default of both array buckets. | [Buckets](./indexes.md) |
| `TOIMBucketCommandsOptions` | type | Options of `OIMBucketCommands`: `maxCommandsPerSlot`. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `IOIMBucketCommands` | interface | The recorder a bucket content service reports positional writes to: `recordInsert`, `recordRemove`, `recordMove`, `recordWholeList`. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `TOIMOrderedListCommand` | type | One ordered-list command: insert, remove, move, or reset to a whole list. | [The commands, on the bucket slot](./indexes.md#the-commands-on-the-bucket-slot) |
| `oimOrderedListCommandsOfTransition` | function | Computes the ordered-list commands that turn one slot sequence into another, optionally capped. | [Rendering an ordered bucket](./indexes.md#rendering-an-ordered-bucket) |
| `TOIMBucketSlot` | type | An indexable slot that carries a bucket's member store, its owner, the commands recorded on it, and `isWholeListRecorded`. | [A slot](./architecture.md#a-slot) |
| `TOIMBucketContentSlot` | type | A bucket slot without a key: what a single bucket holds and what the bucket content services take. | [Buckets](./indexes.md) |
| `TOIMBucketSlotsSetStore` | type | The member store of a set-driven bucket. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |
| `TOIMBucketSlotsArrayStore` | type | The member store of an array bucket: `{ bucketMemberSlots, uniqueBucketMemberSlots, sortedCount }`. | [How a bucket holds its slots](./indexes.md#how-a-bucket-holds-its-slots-the-content-services) |

## Indexes

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMSlotCollectionIndexService` | class | A collection service of buckets filled from an entity store slot by `keyOf`: `createIndexStoreSlot`, `disposeIndexStoreSlot`, `getEntitiesByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, the bucket column doors; its `slotContentService` is typed to the reads. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `OIMSlotCollectionSortedArrayIndexService` | class | `OIMSlotCollectionIndexService` over a sorted bucket content service, re-filing a member when one of its sort columns changes. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMSlotCollectionIndexServiceOptions` | type | Constructor options of `OIMSlotCollectionIndexService`: the collection options plus `keyOf`, `columns`, `sourceSlotCollectionService`, `indexKeysService`. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `TOIMIndexStoreSlot` | type | An index's store slot: a store slot of buckets with its `sourceStoreSlot`, its listener, `indexKeysPosition` and `isDisposed`. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `TOIMSlotCollectionIndexServiceStoreSlot` | type | The index store slot type of a given `OIMSlotCollectionIndexService`. | [Ordering](./oimindex.md#ordering) |
| `TOIMSlotCollectionIndexServiceFactoryOptions` | type | The options every index factory shares: `entityService` (anything with `getSlots`), `slotReleasePolicy`, `columnSlotStoreService`, `columnNames`. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `createOIMSlotCollectionIndexService` | function | Builds an index on an `OIMDB` over an entity collection service; positional array buckets without commands unless `slotContentService` is passed; an array key needs a `bucketSlotStoreService`. | [How an index files entities](./oimindex.md#how-an-index-files-entities) |
| `createOIMSlotCollectionSortedArrayIndexService` | function | Builds an `OIMSlotCollectionSortedArrayIndexService` sorted by `sortColumns`. | [Sorted at write](./oimindex.md#sorted-at-write) |
| `TOIMIndexKeyOptions` | type | `{ columns }`, `{ keyOf }` or both: where an index key comes from. | [Where the key comes from](./oimindex.md#where-the-key-comes-from-columns-keyof-or-both) |
| `TOIMIndexKey` | type | The key type an index derives from its `columns`: one column's value, or a tuple of several. | [A key of several columns](./oimindex.md#a-key-of-several-columns) |
| `IOIMIndexKeysService` | interface | How the per-index key cells on a slot are allocated, read, written and reclaimed. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `TOIMIndexKeysPositions` | type | The positions allocated on one source store slot. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `OIMIndexKeysService` | abstract class | Base of the two index-keys strategies. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `OIMAppendingIndexKeysService` | class | Never reuses a position. The default. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `OIMReclaimingIndexKeysService` | class | Wipes and reuses a position at `disposeIndexStoreSlot`. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |

## Computed

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMComputedService` | class | A computed collection type: `computedCollectionService` and `createComputedStoreSlot(channelMap, derive?, createSources?)`. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `TOIMComputedServiceOptions` | type | Constructor options of `OIMComputedService`. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `createOIMComputedService` | function | Builds an `OIMComputedService`; takes no db. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `TOIMComputedStoreSlot` | type | A computed store slot: a store slot with its `derive` and `createSources`. | [One derivation per key](./computed-effects.md#one-derivation-per-key) |
| `OIMSortedComputedService` | class | Per key of an index store slot, that bucket's entity slots sorted: `computedCollectionService`, `createSortedStoreSlot(indexStoreSlot)`. | [Ordering](./oimindex.md#ordering) |
| `TOIMSortedComputedServiceOptions` | type | Constructor options of `OIMSortedComputedService`. | [Ordering](./oimindex.md#ordering) |
| `TOIMSortedComputedSlot` | type | The computed slot of a sorted list. | [Ordering](./oimindex.md#ordering) |
| `createOIMSortedComputedService` | function | Builds an `OIMSortedComputedService` over an index service; takes no db. | [Ordering](./oimindex.md#ordering) |
| `OIMBucketMemoComputedService` | class | Per key of a bucket store slot, the bucket's member slots as an array kept by identity: `computedCollectionService`, `createBucketMemoStoreSlot(bucketStoreSlot)`. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `TOIMBucketMemoComputedServiceOptions` | type | Constructor options of `OIMBucketMemoComputedService`. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `TOIMBucketMemoComputedSlot` | type | The computed slot of a bucket memo. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `createOIMBucketMemoComputedService` | function | Builds an `OIMBucketMemoComputedService` over a bucket collection service; takes no db. | [The order of a bucket is a derivation](./computed-effects.md#the-order-of-a-bucket-is-a-derivation) |
| `OIMSingleComputedService` | class | One derivation under no key: `createComputedStoreSlot(db, derive?, createSources?)`, read through `computedSingleSlotService`. | [The compute graph](./computed-effects.md) |
| `createOIMSingleComputedService` | function | Builds an `OIMSingleComputedService`. | [The compute graph](./computed-effects.md) |
| `OIMSourceTrackingComputedService` | class | Keyed derivations whose `derive` reads through an `OIMSourceTracker`. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `OIMSingleSourceTrackingComputedService` | class | One derivation whose `derive` reads through an `OIMSourceTracker`. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `createOIMSourceTrackingComputedService` | function | Builds an `OIMSourceTrackingComputedService`. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `createOIMSingleSourceTrackingComputedService` | function | Builds an `OIMSingleSourceTrackingComputedService`. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `TOIMSourceTrackingComputedSlot` | type | A keyed source-tracking derivation slot; read only through a source tracker. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `TOIMSourceTrackingComputedContentSlot` | type | The slot of one source-tracking derivation; read only through a source tracker. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `OIMSlotContentSourceTrackingComputedService` | type only | The content service of a source-tracking derivation collection. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `TOIMSourceTrackingComputedDerivationOptions` | type | The derivation options a source-tracking computed service takes: `derive`, `sameValueGuard`, `releaseValue`, `initialValue`. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `TOIMComputedServiceFactoryOptions` | type | The options every computed factory shares: `sameValueGuard`, `releaseValue`, `initialValue`, `slotReleasePolicy`, `columnSlotStoreService`, `columnNames`. | [The compute graph](./computed-effects.md) |
| `TOIMSourceTrackingComputedDerive` | type | `(computedSlot, sourceTracker) => value`, the `derive` of a source-tracking derivation. | [A derivation that finds its sources as it reads](./computed-effects.md#a-derivation-that-finds-its-sources-as-it-reads) |
| `TOIMComputedDerivationOptions` | type | The derivation options a computed service takes: `createSources`, `derive`, `sameValueGuard`, `initialValue`. | [The compute graph](./computed-effects.md) |
| `TOIMComputedSlot` | type | A slot whose value is derived, with its value service, sources and stamps. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `TOIMComputedSources` | type | `{ sourceSlots, sourceComputeds }`, what `createSources` returns. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `TOIMComputedValueReleaser` | type | `(value) => void`, the `releaseValue` option: gives back what a derived value holds. | [Releasing a computed value](./computed-effects.md#releasing-a-computed-value) |
| `IOIMComputedValueService` | interface | `getValueForSlot(computedSlot)`, the one read that settles a computed. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `OIMComputedValueService` | class | The value service of a computed collection: holds the `sameValueGuard` and serves the value. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `TOIMComputedContentSlot` | type | A computed slot without a key: what a single computed holds. | [The compute graph](./computed-effects.md) |
| `OIMSlotContentComputedService` | type only | The content service of a computed collection. | [The compute graph](./computed-effects.md) |
| `TOIMSlotContentComputedServiceOptions` | type | Its options. | [The compute graph](./computed-effects.md) |
| `TOIMComputedValueServiceOptions` | type | Constructor options of `OIMComputedValueService`. | [A derivation is a slot that nothing marks](./computed-effects.md#a-derivation-is-a-slot-that-nothing-marks) |
| `oimRefreshSourceComputeds` | function | Brings every computed of a list current; a binding read outside an effect calls it before its derive. | [Reading a computed from an effect](./reading-subscribing.md#reading-a-computed-from-an-effect) |
| `TOIMComputedDerivation` | type | What a computed slot and an effect share: their sources and the stamp of their last run. | [Why a computed is pulled](./computed-effects.md#why-a-computed-is-pulled) |
| `TOIMSortColumn` | type | `{ columnName, direction }`, one sort column. | [Ordering](./oimindex.md#ordering) |
| `TOIMSortableColumnName` | type | A column whose values are strings, numbers or bigints. | [Ordering](./oimindex.md#ordering) |
| `oimColumnsComparator` | function | The comparator over sort columns: each in turn, by its direction, an undefined or null value last. | [Ordering](./oimindex.md#ordering) |

## Columns

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `TOIMColumnSlot` | type | A slot for one column of a carrier slot, keyed by the column name. | [Column slots](./collections.md#column-slots) |
| `TOIMComputedColumnSlot` | type | `TOIMComputedSlot<unknown, string>`: the column slot of a computed. | [Computed columns](./computed-effects.md#computed-columns) |
| `TOIMColumnGroup` | type | A named set of columns (`key`, `columnNames`) handed out by `getColumnGroup`. | [Column groups](./collections.md#column-groups) |
| `TOIMColumnReaders` | type | What is kept per column name: whether a single-column slot exists and which column groups name it. | [Column slots](./collections.md#column-slots) |
| `OIMColumnSlotOwner` | abstract class | The owner of a carrier's column slots; an `OIMSlotOwner` that mints, holds and releases them. | [Column slots](./collections.md#column-slots) |
| `OIMPushColumnSlotOwner` | type only | Column owner whose column slots are plain slots woken by marks on a write; entity and bucket collections. | [Column slots](./collections.md#column-slots) |
| `OIMPullColumnSlotOwner` | class | Column owner whose column slots are computed slots over the carrier; computed collections. | [Computed columns](./computed-effects.md#computed-columns) |
| `TOIMColumnSlotOwnerOptions` | type | Either `columnSlotStoreService` or `columnNames` (the ordinal store over those names). | [Naming the columns up front](./collections.md#naming-the-columns-up-front) |

## Channel, effects and scheduling

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `OIMChannelService` | class | `INSTANCE`: runs a channel slot — `write`, `writeWithoutFlushCheck`, `flush`, `subscribeAfterEachFrame`, `subscribeOnceAfterFrame`, `subscribeAfterEachFlush`, `isChangedInCurrentFrame`, `assertNotFlushing`, `dropChannelSlot`. | [The channel](./channel.md) |
| `TOIMChannelSlot` | type | The channel's state: clock, frame, effect queue, handlers, collector slot. | [The channel](./channel.md) |
| `TOIMChannelSlotOptions` | type | Options of `createOIMChannelSlot`. | [The channel](./channel.md) |
| `createOIMChannelSlot` | function | Builds a channel slot over a clock and a collector slot. | [The channel](./channel.md) |
| `IOIMChannelMap` | interface | `{ defaultChannelSlot }`, what `createStoreSlot` and the effect doors take; `OIMDB` is one. | [Every collection has a channel](./model.md#every-collection-has-a-channel) |
| `TOIMChannelFrame` | type | The frame of a channel slot: whether it runs, the clock it opened at, the after-frame handlers. | [The clock](./channel.md#the-clock) |
| `TOIMChannelClock` | type | `{ revision, epoch }`. | [The clock](./channel.md#the-clock) |
| `TOIMChannelScheduler` | type | `(flush) => void`, what defers a flush. | [Schedulers](./channel.md#schedulers) |
| `OIMChannelQueue` | type only | The reusable queue the channel and the services batch with: `getEntryCount`, `getEntryAt`. | [The content-change hook](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `oimIsAnySlotChangedAfter` | function | Answers whether any slot of a list changed after a clock reading, given as a revision and an epoch. | [The clock](./channel.md#the-clock) |
| `IOIMErrorPolicy` | interface | `onErrorCaught(error)`, what a throw caught during a flush becomes. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `OIMLogAndContinueErrorPolicy` | class | Logs the throw, hands it to `onError`, and goes on. The default. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `TOIMLogAndContinueErrorPolicyOptions` | type | `{ onError }`. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `OIMThrowAtOnceErrorPolicy` | class | Throws the first throw out of `flush()`. | [After the flush has ended](./channel.md#after-the-flush-has-ended) |
| `OIMEffectService` | class | `INSTANCE`: `createEffect`, `createAndRunEffect`, `subscribeEffect`, `createSourceTrackingEffect`, `disposeEffect`, each taking the channel map first. | [Effects](./computed-effects.md#effects) |
| `IOIMEffectService` | interface | What an effect carries as its service. | [Effects](./computed-effects.md#effects) |
| `TOIMEffect` | type | A plain effect object; built only by the effect service. | [Subscribing is building an effect](./reading-subscribing.md#subscribing-is-building-an-effect) |
| `TOIMEffectBody` | type | `() => (() => void) \| void`; a returned function is the undo. | [A body may hand back its own undo](./reading-subscribing.md#a-body-may-hand-back-its-own-undo) |
| `TOIMSourceTrackingEffectBody` | type | The body of a tracked effect, handed an `OIMSourceTracker`. | [An effect that finds its sources as it reads](./computed-effects.md#an-effect-that-finds-its-sources-as-it-reads) |
| `OIMSourceTracker` | type only | `readSourceSlot`, `readSourceComputedValue`: what a tracked body reads through. | [An effect that finds its sources as it reads](./computed-effects.md#an-effect-that-finds-its-sources-as-it-reads) |
| `OIMFlushSchedulerService` | abstract class | The base of what a timer fires: the schedule and cancel of one standing callback on a `TOIMFlushSchedulerSlot`. | [Source layout](./architecture.md#source-layout) |
| `TOIMFlushSchedulerSlot` | type | `{ timer, scheduledCallback, timerDisposer }`. | [Source layout](./architecture.md#source-layout) |
| `IOIMFlushSchedulerListener` | interface | What a flush scheduler calls when its timer fires. | [The channel](./channel.md) |
| `TOIMTimer` | type | `(run, inMs) => TOIMDisposer`, how a host schedules a timed run. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `TOIMDisposer` | type | `() => void`. | [Giving many handles back at once](./reading-subscribing.md#giving-many-handles-back-at-once) |

## Release policies and collectors

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `IOIMSlotReleasePolicy` | interface | Whether and when an unheld slot may go. | [The question a policy answers](./lifecycle.md#the-question-a-policy-answers) |
| `OIMSlotAtEmptyReleasePolicy` | class | `INSTANCE`: an empty unheld slot goes; a filled one stays. The default of entity, bucket and index collections. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotNeverReleasePolicy` | class | `INSTANCE`: nothing goes. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotAtUnholdReleasePolicy` | class | `INSTANCE`: an unheld slot goes, value or not. The default of computeds. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotAfterWriteReleasePolicy` | class | A slot goes once its last write is older than `keepAfterWriteMs`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `TOIMSlotAfterWriteReleasePolicyOptions` | type | `{ keepAfterWriteMs, slotReleaseDueFramePolicy? }`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `IOIMSlotReleaseDueFramePolicy` | interface | Which writes move the after-write deadline: `isSlotReleaseDueFrameOpen()`. | [Which writes move the deadline](./lifecycle.md#which-writes-move-the-deadline) |
| `OIMSlotReleaseAutoDueFramePolicy` | class | Every write is its own frame; the default. | [Which writes move the deadline](./lifecycle.md#which-writes-move-the-deadline) |
| `OIMSlotReleaseManualDueFramePolicy` | class | Only writes inside a frame opened by hand move the deadline. | [Which writes move the deadline](./lifecycle.md#which-writes-move-the-deadline) |
| `OIMSlotAfterIdleReleasePolicy` | class | A slot goes once nothing has watched it for `keepAfterIdleMs`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `TOIMSlotAfterIdleReleasePolicyOptions` | type | `{ keepAfterIdleMs }`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotAfterUnholdReleasePolicy` | class | A slot goes once `keepAfterUnholdMs` has passed since its last unhold. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `TOIMSlotAfterUnholdReleasePolicyOptions` | type | `{ keepAfterUnholdMs }`. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMSlotEarliestReleasePolicy` | class | As soon as any of several policies says so. | [Releasing an identity on a clock](./lifecycle.md#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) |
| `OIMUnusedSlotCollectorService` | class | `INSTANCE`: holds what a getter minted until the next flush; `holdSlotUntilFlush`, `flush`, `open`, `close`, `run`. | [The unused-slot collector](./reading-subscribing.md#the-unused-slot-collector) |
| `TOIMUnusedSlotCollectorSlot` | type | The unused-slot collector's state. | [The unused-slot collector](./reading-subscribing.md#the-unused-slot-collector) |
| `createOIMUnusedSlotCollectorSlot` | function | Builds an unused-slot collector slot of your own. | [The unused-slot collector](./reading-subscribing.md#the-unused-slot-collector) |
| `TOIMCollectorSlot` | type | The db's collector slots: the unused-slot collector and the three release collectors. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `TOIMCollectorSlotOptions` | type | `{ getNowMs, releaseTimer, errorPolicy }`. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `createOIMCollectorSlot` | function | Builds a collector slot. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `OIMSlotWheel` | abstract class | A wheel of slots in slices of `OIM_SLICE_LENGTH_MS`, with its own timer and clock: `flush`, `cancelAllSlots`, `getNextSliceNumber`, `sweepUpToSliceNumber`. | [The collectors](./architecture.md#the-collectors) |
| `TOIMSlotWheelOptions` | type | `{ getNowMs, timer, errorPolicy }`. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `OIMSlotReleaseWheel` | class | The wheel a release policy files into; reads and writes the marker it was built with. Three per db on `collectorSlot`. | [What restarts each window](./lifecycle.md#what-restarts-each-window) |
| `oimMintAfterWriteSlotReleaseWheel` | function | The db's after-write release wheel, created on first use. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `oimMintAfterIdleSlotReleaseWheel` | function | The db's after-idle release wheel, created on first use. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `oimMintAfterUnholdSlotReleaseWheel` | function | The db's after-unhold release wheel, created on first use. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `TOIMSlotReleaseWheelOptions` | type | Wheel options plus `{ getReleaseDueMs, setReleaseDueMs, releaseScheduledSlotFlag }`. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `OIMSlotRefetchWheel` | class | A wheel of slots due a refetch at an explicit time: `scheduleSlotRefetchAt(slot, atMs)`; hands every watched due slot to its listener once per sweep. | [Refetching on a clock](./lifecycle.md#refetching-on-a-clock) |
| `TOIMSlotRefetchWheelOptions` | type | `{ slotRefetchListener, getNowMs?, timer?, errorPolicy? }`. | [Refetching on a clock](./lifecycle.md#refetching-on-a-clock) |
| `IOIMSlotRefetchListener` | interface | `onSlotsRefetchDue(slots)`. | [Refetching on a clock](./lifecycle.md#refetching-on-a-clock) |
| `oimSliceOfMs` | function | The number of the time slice a millisecond timestamp falls in. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |
| `OIM_SLICE_LENGTH_MS` | const | Length of one release time slice: 1024 ms. | [Controlling the clock](./lifecycle.md#controlling-the-clock) |

## Slot stores and keys

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `TOIMStoreKey` | type | A scalar key: a string or a number. | [Scalar keys](./collections.md#scalar-keys) |
| `IOIMSlotStoreService` | interface | Stateless service over a keyed slot store: create, own a key, compare keys, get, set, remove, iterate, size. | [How a collection is keyed is the store's business](./collections.md#how-a-collection-is-keyed-is-the-stores-business) |
| `OIMSlotMapStoreService` | class | `IOIMSlotStoreService` over a Map. | [Building one](./collections.md#building-one) |
| `OIMSlotTreeStoreService` | class | `IOIMSlotStoreService` keyed by a composite key, filed in a tree walked by a key tree walk. | [Composite keys come in two strategies](./collections.md#composite-keys-come-in-two-strategies-and-you-pick-one) |
| `OIMSingleSlotStoreService` | class | `INSTANCE`: keyed by `void`, files at most one slot; the store service of every single. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMSingleSlotStore` | type | The store of a single: `{ slot }`. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMDefaultSlotStore` | type | The store a collection gets when its `TStore` is not named: `TOIMSingleSlotStore<TSlot>` for a `void` key, `Map<TKey, TSlot>` otherwise. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMSlotStoreTree` | type | The tree store: a root key node and the set of filed slots. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `IOIMKeyTreeWalk` | interface | Walks a composite key through a tree of key nodes: mint the node, find it, prune it. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `OIMKeyTreeWalk` | abstract class | Base of the key tree walks. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `OIMScalarKeyTreeWalk` | class | Key tree walk over scalar key parts, which holds nothing. | [A chain of values](./collections.md#a-chain-of-values) |
| `OIMCompositeKeyTreeWalk` | class | Key tree walk over entity-slot key parts, which holds each part while the edge stands. | [A chain of identities](./collections.md#a-chain-of-identities) |
| `TOIMCompositeKeyNode` | type | One node of the key tree. | [A chain of identities](./collections.md#a-chain-of-identities) |

## Slots and owners

| Export | Kind | What it is | Documented at |
|---|---|---|---|
| `TOIMSlot` | type | The base slot: effects and their edges, change stamps, hold count, three release-due times, `slotFlags`, column slot store, `storeSlot`, owner. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `TOIMKeyedSlot` | type | `TOIMSlot` with a key. | [A slot](./architecture.md#a-slot) |
| `TOIMIndexableSlot` | type | `TOIMKeyedSlot` with index-key cells. | [The content-change hook and indexKeys](./oimindex.md#the-content-change-hook-and-indexkeys) |
| `TOIMEditable` | type | The same type with every field writable. | [A slot](./architecture.md#a-slot) |
| `TOIMStoreSlot` | type | A store slot: one collection's state — `store`, `channelSlot`, listeners, column state. Not a slot. | [A slot](./architecture.md#a-slot) |
| `TOIMSingleSlotStoreSlot` | type | The store slot of a single. | [The three kinds of slot](./model.md#the-three-kinds-of-slot) |
| `IOIMStoreSlotListener` | interface | Told of every store slot created; set as `OIMDefaults.STORE_SLOT_LISTENER` before the first collection is built. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `OIMNoStoreSlotListener` | class | The default store slot listener: hears nothing. | [Collection types and store slots](./architecture.md#collection-types-and-store-slots) |
| `IOIMSlotSubscriptionListener` | interface | `onSlotFirstSubscribed(slot)` and `onSlotLastUnsubscribed(slot)`: a slot of the collection got its first subscriber or lost its last; a column slot is handed over as itself. The `slotSubscriptionListener` option of the entity, bucket and index factories. | [Knowing when a slot is watched](./reading-subscribing.md#knowing-when-a-slot-is-watched) |
| `OIMNoSlotSubscriptionListener` | class | `INSTANCE`: the default subscription listener, hears nothing. | [Knowing when a slot is watched](./reading-subscribing.md#knowing-when-a-slot-is-watched) |
| `oimIsSlotEmpty` | function | Reads the EMPTY bit of `slot.slotFlags`. | [A slot](./architecture.md#a-slot) |
| `oimIsSlotReleased` | function | Reads the RELEASED bit of `slot.slotFlags`. | [A slot](./architecture.md#a-slot) |
| `OIMSlotOwner` | class | Base slot owner: hold and unhold counting, subscribing and unsubscribing an effect, the refusal on a released slot. | [Who holds](./architecture.md#who-holds) |
| `IOIMSlotOwner` | interface | What every slot's owner answers: hold, unhold, release if unheld, subscribe, unsubscribe. | [A slot goes when nothing refers to it](./model.md#a-slot-goes-when-nothing-refers-to-it) |
| `IOIMSlotEmptinessPolicy` | interface | The strategy that answers whether a slot counts as empty. | [Emptiness is a strategy](./collections.md#emptiness-is-a-strategy) |
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
