import type { OIMSlotContentBucketService } from '../bucket/OIMSlotContentBucketService';
import type { IOIMContentChangeListener } from '../../engine/slot/interfaces/IOIMContentChangeListener';
import type { IOIMIndexKeysService } from '../../engine/index/interfaces/IOIMIndexKeysService';
import type { OIMChannelQueue } from '../../engine/channel/OIMChannelQueue';
import { OIMChannelService } from '../../engine/channel/OIMChannelService';
import { OIMUnusedSlotCollectorService } from '../../engine/collector/OIMUnusedSlotCollectorService';
import type { OIMColumnOwnerPushDriven } from '../../engine/column/OIMColumnOwnerPushDriven';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMIndexStoreSlot } from '../../engine/index/types/TOIMIndexStoreSlot';
import type { TOIMSlotEditable } from '../../engine/slot/types/TOIMSlotEditable';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMIndexServiceOptions } from './types/TOIMIndexServiceOptions';
import { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { createOIMIndexStoreSlot } from '../../engine/index/utils/createOIMIndexStoreSlot';
import { OIMContentChangeListenerService } from '../../engine/slot/OIMContentChangeListenerService';
import { oimIsSlotReleased } from '../../engine/slot/utils/oimIsSlotReleased';

export class OIMIndexService<
    TKey, TEntity extends object, TSlots, TSourceKey = unknown, TSourceStore = unknown,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>
        = OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>,
    TBucketSlot extends TOIMBucketSlot<TSlots, TKey> = TOIMBucketSlot<TSlots, TKey>,
    TStore = Map<TKey, TBucketSlot>,
> extends OIMSlotCollectionService<
    TKey, TBucketSlot, TStore,
    Pick<TSlotContentService, Extract<keyof TSlotContentService,
        'getBucketMemberSlots' | 'getBucketMemberSlotCount' | 'hasBucketMemberSlot' | 'getBucketMemberSlotAt' | 'getBucketMemberSlotPosition'
    >>,
    string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TOIMEntitySlot<TEntity>[]
> {
    protected readonly slotContentBucketService: TSlotContentService;

    private readonly keyOf: (entity: TEntity) => TKey;

    private readonly keyColumns: readonly string[] | undefined;

    private readonly sourceSlotCollectionService: Pick<OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>, 'getSlots'>;


    private readonly indexKeysService: IOIMIndexKeysService;

    public constructor(options: TOIMIndexServiceOptions<TKey, TEntity, TBucketSlot, TStore, TSlotContentService, TSourceKey, TSourceStore>) {
        super(options);
        this.slotContentBucketService = options.slotContentService;
        this.keyOf = options.keyOf;
        this.keyColumns = options.columns;
        this.sourceSlotCollectionService = options.sourceSlotCollectionService;
        this.indexKeysService = options.indexKeysService;
    }

    public createIndexStoreSlot(
        sourceStoreSlot: TOIMStoreSlot<TSourceStore, TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>>,
    ): TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore> {
        const contentChangeListener: IOIMContentChangeListener<TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>> = {
            onContentChanged: (entitySlot, patch, changedColumns) => {
                this.updateIndexKeyForSlot(indexStoreSlot, entitySlot, patch, changedColumns);
            },
            onContentChangedMany: (entitySlotChannelQueue, patchChannelQueue, changedColumnsChannelQueue) => {
                this.updateIndexKeysForSlots(indexStoreSlot, entitySlotChannelQueue, patchChannelQueue, changedColumnsChannelQueue);
            },
        };
        const indexStoreSlot = this.createStoreSlotWith(store => createOIMIndexStoreSlot<
            TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore
        >(store, sourceStoreSlot, contentChangeListener));
        const indexKeysService = this.indexKeysService;
        const indexKeysPositions = ((sourceStoreSlot as TOIMSlotEditable<typeof sourceStoreSlot>).indexKeysPositions
            ??= indexKeysService.createPositions());
        (indexStoreSlot as TOIMSlotEditable<typeof indexStoreSlot>).indexKeysPosition = indexKeysService.allocatePosition(indexKeysPositions);
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(sourceStoreSlot, contentChangeListener, this.keyColumns);
        return indexStoreSlot;
    }

    public disposeIndexStoreSlot(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
    ): void {
        this.assertNotDisposed(indexStoreSlot);
        OIMChannelService.INSTANCE.assertNotFlushing(indexStoreSlot.channelSlot);
        const sourceStoreSlot = indexStoreSlot.sourceStoreSlot;
        OIMContentChangeListenerService.INSTANCE.removeContentChangeListener(sourceStoreSlot, indexStoreSlot.contentChangeListener);
        for (const bucketColumnName of indexStoreSlot.bucketColumnNames) {
            OIMContentChangeListenerService.INSTANCE.removeReadColumn(sourceStoreSlot, bucketColumnName);
        }
        if (indexStoreSlot.isAnyBucketColumnRead) OIMContentChangeListenerService.INSTANCE.removeReadAnyColumn(sourceStoreSlot);
        const indexKeysPositions = sourceStoreSlot.indexKeysPositions;
        if (indexKeysPositions !== undefined) {
            this.indexKeysService.releasePosition(
                indexKeysPositions, indexStoreSlot.indexKeysPosition, this.sourceSlotCollectionService.getSlots(sourceStoreSlot),
            );
        }
        const slotContentService = this.slotContentBucketService;
        const bucketSlots = Array.from(this.getSlots(indexStoreSlot));
        for (let i = 0; i < bucketSlots.length; i++) {
            if (oimIsSlotReleased(bucketSlots[i])) continue;
            slotContentService.clearBucketMemberSlots(bucketSlots[i]);
        }
        (indexStoreSlot as TOIMSlotEditable<typeof indexStoreSlot>).isDisposed = true;
    }

    public override getSlotByKey(storeSlot: TOIMStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[]>, key: TKey): TBucketSlot {
        this.assertNotDisposed(storeSlot);
        return super.getSlotByKey(storeSlot, key);
    }

    public override holdSlotByKey(storeSlot: TOIMStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[]>, key: TKey): TBucketSlot {
        this.assertNotDisposed(storeSlot);
        return super.holdSlotByKey(storeSlot, key);
    }

    public getEntitiesByKey(
        indexStoreSlot: TOIMStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[]>, key: TKey,
    ): (TEntity | undefined)[] {
        const entities: (TEntity | undefined)[] = [];
        for (const entitySlot of this.slotContentBucketService.getBucketMemberSlots(this.getSlotByKey(indexStoreSlot, key))) {
            entities.push(entitySlot.entity);
        }
        return entities;
    }

    public getSlotsByKeys(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        keys: readonly TKey[],
    ): TBucketSlot[] {
        return this.walkSlotsByKeys(indexStoreSlot, keys, takeNothing, key => super.getSlotByKey(indexStoreSlot, key));
    }

    public holdSlotsByKeys(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        keys: readonly TKey[],
    ): TBucketSlot[] {
        return this.walkSlotsByKeys(
            indexStoreSlot, keys,
            foundBucketSlot => { this.slotOwnerService.holdSlot(foundBucketSlot); },
            key => super.holdSlotByKey(indexStoreSlot, key),
        );
    }

    private walkSlotsByKeys(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        keys: readonly TKey[],
        takeFoundSlot: (foundBucketSlot: TBucketSlot) => void,
        slotByKeyDoor: (key: TKey) => TBucketSlot,
    ): TBucketSlot[] {
        this.assertNotDisposed(indexStoreSlot);
        const indexStoreSlotEditable = indexStoreSlot as TOIMSlotEditable<typeof indexStoreSlot>;
        const bucketSlots: TBucketSlot[] = [];
        let entitySlotsByMintedBucketSlot: Map<TBucketSlot, TOIMEntitySlot<TEntity, TSourceKey>[]> | undefined;
        indexStoreSlotEditable.requestedKeys = keys;
        try {
            for (let i = 0; i < keys.length; i++) {
                const foundBucketSlot = this.findSlotByKey(indexStoreSlot, keys[i]);
                if (foundBucketSlot !== undefined) {
                    takeFoundSlot(foundBucketSlot);
                    bucketSlots.push(foundBucketSlot);
                    continue;
                }
                const bucketSlot = slotByKeyDoor(keys[i]);
                (entitySlotsByMintedBucketSlot ??= new Map()).set(bucketSlot, []);
                bucketSlots.push(bucketSlot);
            }
        } finally {
            indexStoreSlotEditable.requestedKeys = undefined;
            if (entitySlotsByMintedBucketSlot !== undefined) this.fillMintedBucketSlots(indexStoreSlot, entitySlotsByMintedBucketSlot);
        }
        return bucketSlots;
    }

    public getAnyBucketColumnByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey,
    ): TOIMColumnSlot {
        this.addAnyBucketColumnRead(indexStoreSlot);
        return this.slotOwnerService.columnOwner.getAnyColumn(
            this.getSlotByKey(indexStoreSlot, key), indexStoreSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot,
        );
    }

    public holdAnyBucketColumnByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey,
    ): TOIMColumnSlot {
        this.addAnyBucketColumnRead(indexStoreSlot);
        return this.slotOwnerService.columnOwner.holdAnyColumn(this.getSlotByKey(indexStoreSlot, key));
    }

    public getBucketColumnByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey, columnName: string,
    ): TOIMColumnSlot {
        this.addBucketColumnName(indexStoreSlot, columnName);
        return this.slotOwnerService.columnOwner.getColumn(
            this.getSlotByKey(indexStoreSlot, key), columnName, indexStoreSlot.channelSlot.collectorSlot.unusedSlotCollectorSlot,
        );
    }

    public holdBucketColumnByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey, columnName: string,
    ): TOIMColumnSlot {
        this.addBucketColumnName(indexStoreSlot, columnName);
        return this.slotOwnerService.columnOwner.holdColumn(this.getSlotByKey(indexStoreSlot, key), columnName);
    }

    protected addBucketColumnName(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        columnName: string,
    ): void {
        const bucketColumnNames = indexStoreSlot.bucketColumnNames;
        if (bucketColumnNames.has(columnName)) return;
        bucketColumnNames.add(columnName);
        OIMContentChangeListenerService.INSTANCE.addReadColumn(indexStoreSlot.sourceStoreSlot, columnName);
    }

    protected onBucketColumnsChanged(
        _indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        _bucketSlot: TBucketSlot, _entitySlot: TOIMEntitySlot<TEntity, TSourceKey>, _changedColumns: readonly string[] | undefined,
    ): void { return; }

    protected override onSlotMinted(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        bucketSlot: TBucketSlot,
    ): void {
        if (indexStoreSlot.requestedKeys !== undefined) return;
        const key = bucketSlot.key;
        this.slotContentBucketService.fillBucketMemberSlots(
            bucketSlot, this.setIndexKeyForSlots(indexStoreSlot, this.collectSourceSlotsForKey(indexStoreSlot, key), key),
        );
    }

    private assertNotDisposed(storeSlot: TOIMStoreSlot): void {
        if (!storeSlot.isDisposed) return;
        throw new Error(
            'OIMIndexService: this index store slot was disposed. It no longer hears its source store slot and its '
            + 'buckets were emptied, so anything it answered now would be stale. Create a new store slot.',
        );
    }

    private addAnyBucketColumnRead(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
    ): void {
        if (indexStoreSlot.isAnyBucketColumnRead) return;
        (indexStoreSlot as TOIMSlotEditable<typeof indexStoreSlot>).isAnyBucketColumnRead = true;
        OIMContentChangeListenerService.INSTANCE.addReadAnyColumn(indexStoreSlot.sourceStoreSlot);
    }

    private fillMintedBucketSlots(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlotsByMintedBucketSlot: Map<TBucketSlot, TOIMEntitySlot<TEntity, TSourceKey>[]>,
    ): void {
        for (const entitySlot of this.sourceSlotCollectionService.getSlots(indexStoreSlot.sourceStoreSlot)) {
            const nextKey = this.nextKeyOf(entitySlot);
            if (nextKey === undefined) continue;
            const bucketSlot = this.findSlotByKey(indexStoreSlot, nextKey);
            if (bucketSlot !== undefined) entitySlotsByMintedBucketSlot.get(bucketSlot)?.push(entitySlot);
        }
        const slotContentService = this.slotContentBucketService;
        const slotOwnerService = this.slotOwnerService;
        for (const [bucketSlot, entitySlots] of entitySlotsByMintedBucketSlot) {
            slotContentService.fillBucketMemberSlots(bucketSlot, this.setIndexKeyForSlots(indexStoreSlot, entitySlots, bucketSlot.key));
            slotOwnerService.settleEmptiness(bucketSlot, slotContentService.isSlotEmpty(bucketSlot));
        }
    }

    private nextKeyOf(entitySlot: TOIMEntitySlot<TEntity, TSourceKey>): TKey | undefined {
        const entity = entitySlot.entity;
        return entity === undefined ? undefined : this.keyOf(entity);
    }

    private isKeyColumnChanged(changedColumns: readonly string[] | undefined): boolean {
        const keyColumns = this.keyColumns;
        if (changedColumns === undefined || keyColumns === undefined) return true;
        for (let i = 0; i < changedColumns.length; i++) {
            if (keyColumns.includes(changedColumns[i])) return true;
        }
        return false;
    }

    private isBucketColumnChanged(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        changedColumns: readonly string[] | undefined,
    ): boolean {
        if (indexStoreSlot.isAnyBucketColumnRead) return true;
        const bucketColumnNames = indexStoreSlot.bucketColumnNames;
        if (bucketColumnNames.size === 0) return false;
        if (changedColumns === undefined) return true;
        for (let i = 0; i < changedColumns.length; i++) {
            if (bucketColumnNames.has(changedColumns[i])) return true;
        }
        return false;
    }

    private updateIndexKeyForSlot(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlot: TOIMEntitySlot<TEntity, TSourceKey>, patch: Partial<TEntity> | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        const indexKeysService = this.indexKeysService;
        const indexKeysPosition = indexStoreSlot.indexKeysPosition;
        const prevKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
        let isRefused = false;
        let refusal: unknown;
        try {
            this.decideIndexKeyForSlot(indexStoreSlot, entitySlot, patch, changedColumns);
        } catch (error) {
            isRefused = true;
            refusal = error;
        }
        const nextKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
        if (nextKey !== prevKey) {
            const slotContentService = this.slotContentBucketService;
            if (nextKey !== undefined) {
                const nextBucketSlot = this.findSlotByKey(indexStoreSlot, nextKey);
                if (nextBucketSlot !== undefined) slotContentService.addBucketMemberSlot(nextBucketSlot, entitySlot);
            }
            if (prevKey !== undefined) {
                const prevBucketSlot = this.findSlotByKey(indexStoreSlot, prevKey);
                if (prevBucketSlot !== undefined) slotContentService.removeBucketMemberSlot(prevBucketSlot, entitySlot);
            }
        }
        if (isRefused) throw refusal;
    }

    private updateIndexKeysForSlots(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlotChannelQueue: OIMChannelQueue<TOIMEntitySlot<TEntity, TSourceKey>>,
        patchChannelQueue: OIMChannelQueue<Partial<TEntity> | undefined>,
        changedColumnsChannelQueue: OIMChannelQueue<readonly string[] | undefined>,
    ): void {
        const indexKeysService = this.indexKeysService;
        const indexKeysPosition = indexStoreSlot.indexKeysPosition;
        let arrivingByKey: Map<TKey, TOIMEntitySlot<TEntity>[] | null> | undefined;
        let leavingByKey: Map<TKey, TOIMEntitySlot<TEntity>[] | null> | undefined;
        const bucketSlotsByKey = new Map<TKey, TBucketSlot>();
        let isRefused = false;
        let refusal: unknown;
        for (let i = 0; i < entitySlotChannelQueue.getEntryCount(); i++) {
            const entitySlot = entitySlotChannelQueue.getEntryAt(i);
            const prevKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
            try {
                this.decideIndexKeyForSlot(indexStoreSlot, entitySlot, patchChannelQueue.getEntryAt(i), changedColumnsChannelQueue.getEntryAt(i));
            } catch (error) {
                if (!isRefused) refusal = error;
                isRefused = true;
            }
            const nextKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
            if (nextKey === prevKey) continue;
            if (nextKey !== undefined) {
                this.groupUnderMintedBucketKey(indexStoreSlot, bucketSlotsByKey, arrivingByKey ??= new Map(), nextKey, entitySlot);
            }
            if (prevKey !== undefined) {
                this.groupUnderMintedBucketKey(indexStoreSlot, bucketSlotsByKey, leavingByKey ??= new Map(), prevKey, entitySlot);
            }
        }
        const slotContentService = this.slotContentBucketService;
        if (arrivingByKey !== undefined) {
            for (const [key, arriving] of arrivingByKey) {
                if (arriving !== null) slotContentService.addBucketMemberSlots(bucketSlotsByKey.get(key) as TBucketSlot, arriving);
            }
        }
        if (leavingByKey !== undefined) {
            for (const [key, leaving] of leavingByKey) {
                if (leaving !== null) slotContentService.removeBucketMemberSlots(bucketSlotsByKey.get(key) as TBucketSlot, leaving);
            }
        }
        if (isRefused) throw refusal;
    }

    private groupUnderMintedBucketKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        bucketSlotsByKey: Map<TKey, TBucketSlot>, entitySlotsByKey: Map<TKey, TOIMEntitySlot<TEntity>[] | null>,
        key: TKey, entitySlot: TOIMEntitySlot<TEntity>,
    ): void {
        const grouped = entitySlotsByKey.get(key);
        if (grouped === null) return;
        if (grouped !== undefined) {
            grouped.push(entitySlot);
            return;
        }
        const bucketSlot = bucketSlotsByKey.get(key) ?? this.findSlotByKey(indexStoreSlot, key);
        if (bucketSlot === undefined) {
            entitySlotsByKey.set(key, null);
            return;
        }
        bucketSlotsByKey.set(key, bucketSlot);
        entitySlotsByKey.set(key, [entitySlot]);
    }

    private decideIndexKeyForSlot(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlot: TOIMEntitySlot<TEntity, TSourceKey>, patch: Partial<TEntity> | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        if (oimIsSlotReleased(entitySlot)) return;
        const isKeyColumnChanged = this.isKeyColumnChanged(changedColumns);
        const isBucketColumnChanged = this.isBucketColumnChanged(indexStoreSlot, changedColumns);
        if (!isKeyColumnChanged && !isBucketColumnChanged) return;
        const indexKeysService = this.indexKeysService;
        const indexKeysPosition = indexStoreSlot.indexKeysPosition;
        const prevKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
        let nextKey: TKey | undefined;
        try {
            nextKey = isKeyColumnChanged ? this.nextKeyOf(entitySlot) : prevKey;
        } catch (error) {
            indexKeysService.set(entitySlot, indexKeysPosition, undefined);
            throw error;
        }
        if (prevKey === nextKey || (prevKey !== undefined && nextKey !== undefined && this.isSameKey(prevKey, nextKey))) {
            if (nextKey === undefined || !isBucketColumnChanged) return;
            const bucketSlot = this.findSlotByKey(indexStoreSlot, nextKey);
            if (bucketSlot === undefined) return;
            this.slotContentBucketService.markBucketColumnsChanged(bucketSlot, patch, changedColumns);
            this.onBucketColumnsChanged(indexStoreSlot, bucketSlot, entitySlot, changedColumns);
            return;
        }
        indexKeysService.set(entitySlot, indexKeysPosition, nextKey);
    }

    private collectSourceSlotsForKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey,
    ): TOIMEntitySlot<TEntity, TSourceKey>[] {
        const matchingEntitySlots: TOIMEntitySlot<TEntity, TSourceKey>[] = [];
        for (const entitySlot of this.sourceSlotCollectionService.getSlots(indexStoreSlot.sourceStoreSlot)) {
            const nextKey = this.nextKeyOf(entitySlot);
            if (nextKey === undefined || !this.isSameKey(key, nextKey)) continue;
            matchingEntitySlots.push(entitySlot);
        }
        return matchingEntitySlots;
    }

    private setIndexKeyForSlots(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlots: TOIMEntitySlot<TEntity, TSourceKey>[], key: TKey,
    ): TOIMEntitySlot<TEntity, TSourceKey>[] {
        const indexKeysService = this.indexKeysService;
        const indexKeysPosition = indexStoreSlot.indexKeysPosition;
        const channelSlot = indexStoreSlot.channelSlot;
        const isRefusingWrites = OIMChannelService.INSTANCE.isRefusingWrites(channelSlot);
        let movableEntitySlots: TOIMEntitySlot<TEntity, TSourceKey>[] | undefined;
        for (let i = 0; i < entitySlots.length; i++) {
            const entitySlot = entitySlots[i];
            const prevKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
            const isMoving = prevKey !== undefined && !this.isSameKey(prevKey, key);
            if (isMoving && isRefusingWrites) {
                movableEntitySlots ??= entitySlots.slice(0, i);
                continue;
            }
            movableEntitySlots?.push(entitySlot);
            indexKeysService.set(entitySlot, indexKeysPosition, key);
            if (!isMoving) continue;
            OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(channelSlot.collectorSlot.unusedSlotCollectorSlot, entitySlot);
            const prevBucketSlot = this.findSlotByKey(indexStoreSlot, prevKey);
            if (prevBucketSlot !== undefined) this.slotContentBucketService.removeBucketMemberSlot(prevBucketSlot, entitySlot);
        }
        return movableEntitySlots ?? entitySlots;
    }
}

function takeNothing(): void { return; }
