import type { OIMSlotContentBucketServiceSortedArrayDriven } from '../bucket/OIMSlotContentBucketServiceSortedArrayDriven';
import type { TOIMBucketSlotsSortedArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsSortedArrayStore';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMIndexStoreSlot } from '../../engine/index/types/TOIMIndexStoreSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSortColumn } from '../computed/types/TOIMSortColumn';
import type { TOIMIndexServiceOptions } from './types/TOIMIndexServiceOptions';
import { OIMIndexService } from './OIMIndexService';

export class OIMIndexServiceSortedArrayDriven<
    TKey, TEntity extends object, TSourceKey = unknown, TSourceStore = unknown,
    TBucketSlot extends TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TOIMEntitySlot<TEntity>>, TKey>
        = TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TOIMEntitySlot<TEntity>>, TKey>,
    TStore = Map<TKey, TBucketSlot>,
> extends OIMIndexService<
    TKey, TEntity, TOIMBucketSlotsSortedArrayStore<TOIMEntitySlot<TEntity>>, TSourceKey, TSourceStore,
    OIMSlotContentBucketServiceSortedArrayDriven<TOIMEntitySlot<TEntity>>, TBucketSlot, TStore
> {
    private readonly sortColumnNames: ReadonlySet<string>;

    public constructor(
        options: TOIMIndexServiceOptions<
            TKey, TEntity, TBucketSlot, TStore, OIMSlotContentBucketServiceSortedArrayDriven<TOIMEntitySlot<TEntity>>, TSourceKey, TSourceStore
        > & { sortColumns: readonly TOIMSortColumn<TEntity>[] },
    ) {
        super(options);
        const sortColumnNames = new Set<string>();
        for (let i = 0; i < options.sortColumns.length; i++) sortColumnNames.add(options.sortColumns[i].column);
        this.sortColumnNames = sortColumnNames;
    }

    public override createIndexStoreSlot(
        sourceStoreSlot: TOIMStoreSlot<TSourceStore, TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>>,
    ): TOIMIndexStoreSlot<TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore> {
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
