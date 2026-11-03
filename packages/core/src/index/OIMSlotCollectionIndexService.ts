import type { OIMEntitySlot } from '../entity/OIMEntitySlot';
import type { OIMBucketContentService } from '../bucket/OIMBucketContentService';
import type { IOIMSlotContentChangeListener } from '../slot/interfaces/IOIMSlotContentChangeListener';
import type { IOIMIndexKeysService } from './interfaces/IOIMIndexKeysService';
import type { OIMChannelQueue } from '../channel/OIMChannelQueue';
import { OIMChannelService } from '../channel/OIMChannelService';
import type { OIMPushColumnSlotOwner } from '../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import { getOIMBucketMemberSlotEntities } from '../bucket/utils/getOIMBucketMemberSlotEntities';
import type { TOIMIndexStoreSlot } from './types/TOIMIndexStoreSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMSlotCollectionIndexServiceOptions } from './types/TOIMSlotCollectionIndexServiceOptions';
import { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { createOIMIndexStoreSlot } from './utils/createOIMIndexStoreSlot';
import { OIMSlotContentChangeListenerService } from '../slot/OIMSlotContentChangeListenerService';
import { isOIMSlotReleased } from '../slot/utils/isOIMSlotReleased';
import { OIMSlotCollectionIndexStoreAggregate } from './OIMSlotCollectionIndexStoreAggregate';
import type { TOIMSlotContentChangeListenerReadColumns } from '../slot/types/TOIMSlotContentChangeListenerReadColumns';
import { isOIMAnyAddedColumnRead } from '../slot/utils/isOIMAnyAddedColumnRead';
import type { TOIMBucketContentSlot } from '../bucket/types/TOIMBucketContentSlot';
import { markOIMBucketColumnsChanged } from '../bucket/utils/markOIMBucketColumnsChanged';

export class OIMSlotCollectionIndexService<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots,
    TSourceKey extends NonNullable<unknown> = NonNullable<unknown>, TSourceStore = unknown,
    TBucketContentService extends OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>
        = OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>,
    TBucketSlot extends TOIMBucketSlot<TSlots, TKey> = TOIMBucketSlot<TSlots, TKey>,
    TStore = Map<TKey, TBucketSlot>,
> extends OIMSlotCollectionService<
    TKey, TBucketSlot, TStore,
    Pick<TBucketContentService, Extract<keyof TBucketContentService,
        'getBucketMemberSlots' | 'getBucketMemberSlotCount' | 'hasBucketMemberSlot' | 'getBucketMemberSlotAt' | 'getBucketMemberSlotPosition'
    >>,
    string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TOIMEntitySlot<TEntity, TSourceKey>[]
> {
    protected readonly bucketContentService: TBucketContentService;

    private readonly selectKey: (entity: TEntity) => TKey;

    private readonly keyColumns: readonly string[] | undefined;

    private readonly sourceSlotCollectionService: Pick<OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>, 'getSlots'>;


    private readonly indexKeysService: IOIMIndexKeysService;

    public constructor(options: TOIMSlotCollectionIndexServiceOptions<TKey, TEntity, TBucketSlot, TStore, TBucketContentService, TSourceKey, TSourceStore>) {
        super(options);
        this.bucketContentService = options.slotContentService;
        this.selectKey = options.selectKey;
        this.keyColumns = options.columns;
        this.sourceSlotCollectionService = options.sourceSlotCollectionService;
        this.indexKeysService = options.indexKeysService;
    }

    public createIndexStoreSlot(
        sourceStoreSlot: TOIMStoreSlot<TSourceStore, TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>>,
    ): TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore, this> {
        const contentChangeListener: IOIMSlotContentChangeListener<TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>> = {
            onContentChanged: (entitySlot, patch, changedColumns) => {
                this.updateIndexKeyForSlot(indexStoreSlot, entitySlot, patch, changedColumns);
            },
            onManyContentsChanged: (entitySlotChannelQueue, patchChannelQueue, changedColumnsChannelQueue) => {
                this.updateIndexKeysForSlots(indexStoreSlot, entitySlotChannelQueue, patchChannelQueue, changedColumnsChannelQueue);
            },
        };
        const indexStoreSlot = this.createStoreSlotOverNewStore(store => createOIMIndexStoreSlot<
            TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore, this
        >(store, this, sourceStoreSlot, contentChangeListener));
        const indexKeysService = this.indexKeysService;
        const indexKeysPositions = ((sourceStoreSlot as TOIMEditable<typeof sourceStoreSlot>).indexKeysPositions
            ??= indexKeysService.createPositions());
        (indexStoreSlot as TOIMEditable<typeof indexStoreSlot>).indexKeysPosition = indexKeysService.allocatePosition(indexKeysPositions);
        (indexStoreSlot as TOIMEditable<typeof indexStoreSlot>).slotContentChangeListenerReadColumns = OIMSlotContentChangeListenerService.INSTANCE
            .addContentChangeListener(sourceStoreSlot, contentChangeListener, this.keyColumns);
        return indexStoreSlot;
    }

    public createStoreAggregate(
        indexStoreSlot: TOIMIndexStoreSlot<
            TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore, this
        >,
    ): OIMSlotCollectionIndexStoreAggregate<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TBucketSlot, TStore, this> {
        return new OIMSlotCollectionIndexStoreAggregate(this, indexStoreSlot);
    }

    public disposeIndexStoreSlot(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
    ): void {
        this.assertNotDisposed(indexStoreSlot);
        OIMChannelService.INSTANCE.assertNotFlushing(indexStoreSlot.channelSlot);
        const sourceStoreSlot = indexStoreSlot.sourceStoreSlot;
        OIMSlotContentChangeListenerService.INSTANCE.removeContentChangeListener(sourceStoreSlot, indexStoreSlot.contentChangeListener);
        const indexKeysPositions = sourceStoreSlot.indexKeysPositions;
        if (indexKeysPositions !== undefined) {
            this.indexKeysService.releasePosition(
                indexKeysPositions, indexStoreSlot.indexKeysPosition, this.sourceSlotCollectionService.getSlots(sourceStoreSlot),
            );
        }
        const slotContentService = this.bucketContentService;
        const bucketSlots = Array.from(this.getSlots(indexStoreSlot));
        for (let i = 0; i < bucketSlots.length; i++) {
            if (isOIMSlotReleased(bucketSlots[i])) continue;
            slotContentService.clearSlotContent(bucketSlots[i]);
        }
        (indexStoreSlot as TOIMEditable<typeof indexStoreSlot>).isDisposed = true;
    }

    public override getSlotByKey(storeSlot: TOIMStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[]>, key: TKey): TBucketSlot {
        this.assertNotDisposed(storeSlot);
        return super.getSlotByKey(storeSlot, key);
    }

    public override holdSlotByKey(storeSlot: TOIMStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[]>, key: TKey): TBucketSlot {
        this.assertNotDisposed(storeSlot);
        return super.holdSlotByKey(storeSlot, key);
    }

    public getEntitiesByKey(
        indexStoreSlot: TOIMStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[]>, key: TKey,
    ): TEntity[] {
        return getOIMBucketMemberSlotEntities(this.getSlotByKey(indexStoreSlot, key).getBucketMemberSlots() as Iterable<TOIMEntitySlot<TEntity, TSourceKey>>);
    }

    public getSlotsByKeys(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        keys: readonly TKey[],
    ): TBucketSlot[] {
        return this.walkSlotsByKeys(indexStoreSlot, keys, takeNothing, key => super.getSlotByKey(indexStoreSlot, key));
    }

    public holdSlotsByKeys(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        keys: readonly TKey[],
    ): TBucketSlot[] {
        return this.walkSlotsByKeys(
            indexStoreSlot, keys,
            foundBucketSlot => { this.slotOwnerService.holdSlot(foundBucketSlot); },
            key => super.holdSlotByKey(indexStoreSlot, key),
        );
    }

    private walkSlotsByKeys(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        keys: readonly TKey[],
        takeFoundSlot: (foundBucketSlot: TBucketSlot) => void,
        slotByKeyDoor: (key: TKey) => TBucketSlot,
    ): TBucketSlot[] {
        this.assertNotDisposed(indexStoreSlot);
        const editableIndexStoreSlot = indexStoreSlot as TOIMEditable<typeof indexStoreSlot>;
        const bucketSlots: TBucketSlot[] = [];
        let entitySlotsByMintedBucketSlot: Map<TBucketSlot, TOIMEntitySlot<TEntity, TSourceKey>[]> | undefined;
        editableIndexStoreSlot.requestedKeys = keys;
        try {
            for (let i = 0; i < keys.length; i++) {
                const foundBucketSlot = this.peekSlotByKey(indexStoreSlot, keys[i]);
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
            editableIndexStoreSlot.requestedKeys = undefined;
            if (entitySlotsByMintedBucketSlot !== undefined) this.fillMintedBucketSlots(indexStoreSlot, entitySlotsByMintedBucketSlot);
        }
        return bucketSlots;
    }

    public getAnyBucketColumnSlotByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey,
    ): TOIMColumnSlot {
        this.addAnyBucketColumnRead(indexStoreSlot);
        return this.columnSlotService.getAnyColumnSlot(this.getSlotByKey(indexStoreSlot, key));
    }

    public holdAnyBucketColumnSlotByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey,
    ): TOIMColumnSlot {
        this.addAnyBucketColumnRead(indexStoreSlot);
        return this.columnSlotService.holdAnyColumnSlot(this.getSlotByKey(indexStoreSlot, key));
    }

    public getBucketColumnSlotByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey, columnName: string,
    ): TOIMColumnSlot {
        this.addBucketColumnName(indexStoreSlot, columnName);
        return this.columnSlotService.getColumnSlot(this.getSlotByKey(indexStoreSlot, key), columnName);
    }

    public holdBucketColumnSlotByKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey, columnName: string,
    ): TOIMColumnSlot {
        this.addBucketColumnName(indexStoreSlot, columnName);
        return this.columnSlotService.holdColumnSlot(this.getSlotByKey(indexStoreSlot, key), columnName);
    }

    private addBucketColumnName(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        columnName: string,
    ): void {
        this.assertNotDisposed(indexStoreSlot);
        OIMSlotContentChangeListenerService.INSTANCE.addListenerReadColumn(
            indexStoreSlot.sourceStoreSlot, indexStoreSlot.contentChangeListener, columnName,
        );
    }

    protected onBucketColumnsChanged(
        _indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        _bucketSlot: TBucketSlot, _entitySlot: TOIMEntitySlot<TEntity, TSourceKey>, _changedColumns: readonly string[] | undefined,
    ): void { return; }

    protected override onSlotMinted(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        bucketSlot: TBucketSlot,
    ): void {
        if (indexStoreSlot.requestedKeys !== undefined) return;
        this.fillBucketSlotWithSourceSlots(indexStoreSlot, bucketSlot, this.collectSourceSlotsForKey(indexStoreSlot, bucketSlot.key));
    }

    private assertNotDisposed(storeSlot: TOIMStoreSlot): void {
        if (!storeSlot.isDisposed) return;
        throw new Error(
            'OIMSlotCollectionIndexService: this index store slot was disposed. It no longer hears its source store slot and its '
            + 'buckets were emptied, so anything it answered now would be stale. Create a new store slot.',
        );
    }

    private addAnyBucketColumnRead(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
    ): void {
        this.assertNotDisposed(indexStoreSlot);
        OIMSlotContentChangeListenerService.INSTANCE.addListenerReadAnyColumn(indexStoreSlot.sourceStoreSlot, indexStoreSlot.contentChangeListener);
    }

    private fillMintedBucketSlots(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlotsByMintedBucketSlot: Map<TBucketSlot, TOIMEntitySlot<TEntity, TSourceKey>[]>,
    ): void {
        for (const entitySlot of this.sourceSlotCollectionService.getSlots(indexStoreSlot.sourceStoreSlot)) {
            const nextKey = this.selectNextKey(entitySlot);
            if (nextKey === undefined) continue;
            const bucketSlot = this.peekSlotByKey(indexStoreSlot, nextKey);
            if (bucketSlot !== undefined) entitySlotsByMintedBucketSlot.get(bucketSlot)?.push(entitySlot);
        }
        const slotContentService = this.bucketContentService;
        const slotOwnerService = this.slotOwnerService;
        for (const [bucketSlot, entitySlots] of entitySlotsByMintedBucketSlot) {
            this.fillBucketSlotWithSourceSlots(indexStoreSlot, bucketSlot, entitySlots);
            slotOwnerService.settleEmptiness(bucketSlot, slotContentService.isSlotEmpty(bucketSlot));
        }
    }

    private selectNextKey(entitySlot: TOIMEntitySlot<TEntity, TSourceKey>): TKey | undefined {
        const entity = (entitySlot as unknown as OIMEntitySlot<TEntity>).content;
        return entity === undefined ? undefined : this.selectKey(entity);
    }

    private isKeyColumnChanged(changedColumns: readonly string[] | undefined): boolean {
        const keyColumns = this.keyColumns;
        if (changedColumns === undefined || keyColumns === undefined) return true;
        for (let i = 0; i < changedColumns.length; i++) {
            if (keyColumns.includes(changedColumns[i])) return true;
        }
        return false;
    }

    private updateIndexKeyForSlot(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
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
            const slotContentService = this.bucketContentService;
            if (nextKey !== undefined) {
                const nextBucketSlot = this.peekSlotByKey(indexStoreSlot, nextKey);
                if (nextBucketSlot !== undefined) slotContentService.addBucketMemberSlot(nextBucketSlot, entitySlot);
            }
            if (prevKey !== undefined) {
                const prevBucketSlot = this.peekSlotByKey(indexStoreSlot, prevKey);
                if (prevBucketSlot !== undefined) slotContentService.removeBucketMemberSlot(prevBucketSlot, entitySlot);
            }
        }
        if (isRefused) throw refusal;
    }

    private updateIndexKeysForSlots(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlotChannelQueue: OIMChannelQueue<TOIMEntitySlot<TEntity, TSourceKey>>,
        patchChannelQueue: OIMChannelQueue<Partial<TEntity> | undefined>,
        changedColumnsChannelQueue: OIMChannelQueue<readonly string[] | undefined>,
    ): void {
        const indexKeysService = this.indexKeysService;
        const indexKeysPosition = indexStoreSlot.indexKeysPosition;
        let arrivingByKey: Map<TKey, TOIMEntitySlot<TEntity, TSourceKey>[] | null> | undefined;
        let leavingByKey: Map<TKey, TOIMEntitySlot<TEntity, TSourceKey>[] | null> | undefined;
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
        const slotContentService = this.bucketContentService;
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
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        bucketSlotsByKey: Map<TKey, TBucketSlot>, entitySlotsByKey: Map<TKey, TOIMEntitySlot<TEntity, TSourceKey>[] | null>,
        key: TKey, entitySlot: TOIMEntitySlot<TEntity, TSourceKey>,
    ): void {
        const grouped = entitySlotsByKey.get(key);
        if (grouped === null) return;
        if (grouped !== undefined) {
            grouped.push(entitySlot);
            return;
        }
        const bucketSlot = bucketSlotsByKey.get(key) ?? this.peekSlotByKey(indexStoreSlot, key);
        if (bucketSlot === undefined) {
            entitySlotsByKey.set(key, null);
            return;
        }
        bucketSlotsByKey.set(key, bucketSlot);
        entitySlotsByKey.set(key, [entitySlot]);
    }

    private decideIndexKeyForSlot(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        entitySlot: TOIMEntitySlot<TEntity, TSourceKey>, patch: Partial<TEntity> | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        if (isOIMSlotReleased(entitySlot)) return;
        const isKeyColumnChanged = this.isKeyColumnChanged(changedColumns);
        const isBucketColumnChanged = isOIMAnyAddedColumnRead(
            indexStoreSlot.slotContentChangeListenerReadColumns as TOIMSlotContentChangeListenerReadColumns, changedColumns,
        );
        if (!isKeyColumnChanged && !isBucketColumnChanged) return;
        const indexKeysService = this.indexKeysService;
        const indexKeysPosition = indexStoreSlot.indexKeysPosition;
        const prevKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
        let nextKey: TKey | undefined;
        try {
            nextKey = isKeyColumnChanged ? this.selectNextKey(entitySlot) : prevKey;
        } catch (error) {
            indexKeysService.set(entitySlot, indexKeysPosition, undefined);
            throw error;
        }
        if (prevKey === nextKey || (prevKey !== undefined && nextKey !== undefined && this.isSameKey(prevKey, nextKey))) {
            if (nextKey === undefined || !isBucketColumnChanged) return;
            const bucketSlot = this.peekSlotByKey(indexStoreSlot, nextKey);
            if (bucketSlot === undefined) return;
            markOIMBucketColumnsChanged(bucketSlot as unknown as TOIMBucketContentSlot<TSlots>, patch, changedColumns);
            this.onBucketColumnsChanged(indexStoreSlot, bucketSlot, entitySlot, changedColumns);
            return;
        }
        indexKeysService.set(entitySlot, indexKeysPosition, nextKey);
    }

    private collectSourceSlotsForKey(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        key: TKey,
    ): TOIMEntitySlot<TEntity, TSourceKey>[] {
        const matchingEntitySlots: TOIMEntitySlot<TEntity, TSourceKey>[] = [];
        for (const entitySlot of this.sourceSlotCollectionService.getSlots(indexStoreSlot.sourceStoreSlot)) {
            const nextKey = this.selectNextKey(entitySlot);
            if (nextKey === undefined || !this.isSameKey(key, nextKey)) continue;
            matchingEntitySlots.push(entitySlot);
        }
        return matchingEntitySlots;
    }

    private fillBucketSlotWithSourceSlots(
        indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        bucketSlot: TBucketSlot, entitySlots: TOIMEntitySlot<TEntity, TSourceKey>[],
    ): void {
        const indexKeysService = this.indexKeysService;
        const indexKeysPosition = indexStoreSlot.indexKeysPosition;
        const key = bucketSlot.key;
        const isRefusingWrites = OIMChannelService.INSTANCE.isRefusingWrites(indexStoreSlot.channelSlot);
        const fillingEntitySlots: TOIMEntitySlot<TEntity, TSourceKey>[] = [];
        const prevKeys: TKey[] = [];
        const movingEntitySlots: TOIMEntitySlot<TEntity, TSourceKey>[] = [];
        for (let i = 0; i < entitySlots.length; i++) {
            const entitySlot = entitySlots[i];
            const prevKey = indexKeysService.get<TKey>(entitySlot, indexKeysPosition);
            const isMoving = prevKey !== undefined && !this.isSameKey(prevKey, key);
            if (isMoving && isRefusingWrites) continue;
            fillingEntitySlots.push(entitySlot);
            indexKeysService.set(entitySlot, indexKeysPosition, key);
            if (!isMoving) continue;
            prevKeys.push(prevKey);
            movingEntitySlots.push(entitySlot);
        }
        this.bucketContentService.fillBucketMemberSlots(bucketSlot, fillingEntitySlots);
        for (let i = 0; i < movingEntitySlots.length; i++) {
            const prevBucketSlot = this.peekSlotByKey(indexStoreSlot, prevKeys[i]);
            if (prevBucketSlot !== undefined) this.bucketContentService.removeBucketMemberSlot(prevBucketSlot, movingEntitySlots[i]);
        }
    }
}

function takeNothing(): void { return; }
