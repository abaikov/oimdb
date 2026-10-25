import type { OIMSlotContentSortedArrayBucketService } from '../bucket/OIMSlotContentSortedArrayBucketService';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMIndexStoreSlot } from '../../engine/index/types/TOIMIndexStoreSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSortColumn } from '../computed/types/TOIMSortColumn';
import type { TOIMSlotCollectionIndexServiceOptions } from './types/TOIMSlotCollectionIndexServiceOptions';
import { OIMSlotCollectionIndexService } from './OIMSlotCollectionIndexService';

export class OIMSlotCollectionSortedArrayIndexService<
    TKey extends NonNullable<unknown>, TEntity extends object,
    TSourceKey extends NonNullable<unknown> = NonNullable<unknown>, TSourceStore = unknown,
    TBucketSlot extends TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>, TKey>
        = TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>, TKey>,
    TStore = Map<TKey, TBucketSlot>,
> extends OIMSlotCollectionIndexService<
    TKey, TEntity, TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>, TSourceKey, TSourceStore,
    OIMSlotContentSortedArrayBucketService<TOIMEntitySlot<TEntity>, TKey>, TBucketSlot, TStore
> {
    private readonly sortColumnNames: ReadonlySet<string>;

    public constructor(
        options: TOIMSlotCollectionIndexServiceOptions<
            TKey, TEntity, TBucketSlot, TStore, OIMSlotContentSortedArrayBucketService<TOIMEntitySlot<TEntity>, TKey>, TSourceKey, TSourceStore
        > & { sortColumns: readonly TOIMSortColumn<TEntity>[] },
    ) {
        super(options);
        const sortColumnNames = new Set<string>();
        for (let i = 0; i < options.sortColumns.length; i++) sortColumnNames.add(options.sortColumns[i].column);
        this.sortColumnNames = sortColumnNames;
    }

    public override createIndexStoreSlot(
        sourceStoreSlot: TOIMStoreSlot<TSourceStore, TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>>,
    ): TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore, this> {
        const indexStoreSlot = super.createIndexStoreSlot(sourceStoreSlot);
        for (const sortColumnName of this.sortColumnNames) this.addBucketColumnName(indexStoreSlot, sortColumnName);
        return indexStoreSlot;
    }

    protected override onBucketColumnsChanged(
        _indexStoreSlot: TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore>,
        bucketSlot: TBucketSlot, entitySlot: TOIMEntitySlot<TEntity, TSourceKey>, changedColumns: readonly string[] | undefined,
    ): void {
        if (!this.isSortColumnChanged(changedColumns)) return;
        this.slotContentBucketService.repositionBucketMemberSlot(bucketSlot, entitySlot);
    }

    private isSortColumnChanged(changedColumns: readonly string[] | undefined): boolean {
        if (changedColumns === undefined) return true;
        const sortColumnNames = this.sortColumnNames;
        for (let i = 0; i < changedColumns.length; i++) {
            if (sortColumnNames.has(changedColumns[i])) return true;
        }
        return false;
    }
}
