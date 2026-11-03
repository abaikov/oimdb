import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMIndexStoreSlot } from '../index/types/TOIMIndexStoreSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { OIMSlotCollectionIndexService } from '../index/OIMSlotCollectionIndexService';
import type { TOIMSortColumn } from './types/TOIMSortColumn';
import type { TOIMSortedComputedSlot } from './types/TOIMSortedComputedSlot';
import type { TOIMSlotCollectionIndexServiceStoreSlot } from '../index/types/TOIMSlotCollectionIndexServiceStoreSlot';
import type { TOIMSortedComputedServiceOptions } from './types/TOIMSortedComputedServiceOptions';
import type { OIMComputedContentService } from './OIMComputedContentService';
import { OIMExplicitSourceComputedContentService } from './OIMExplicitSourceComputedContentService';
import { isOIMSameSlotSequence } from '../bucket/utils/isOIMSameSlotSequence';
import { OIMComputedValueService } from './OIMComputedValueService';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';
import { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSlotCollectionStoreAggregate } from '../slot/OIMSlotCollectionStoreAggregate';
import { createOIMPullColumnSlotOwner } from '../column/utils/createOIMPullColumnSlotOwner';
import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import { createOIMColumnsComparator } from './utils/createOIMColumnsComparator';
import { createOIMEntitySlotsComparator } from './utils/createOIMEntitySlotsComparator';
import { sortOIMBucketMemberSlots } from './utils/sortOIMBucketMemberSlots';

export class OIMSortedComputedService<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore, TComputedStore,
> extends OIMSlotCollectionService<
    TKey, TOIMSortedComputedSlot<TEntity, TKey, TSourceKey>, TComputedStore,
    OIMComputedContentService<readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMSortedComputedSlot<TEntity, TKey, TSourceKey>>, string, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    public constructor(options: TOIMSortedComputedServiceOptions<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore>) {
        const indexService = options.indexService;
        const bucketContentService = indexService.slotContentService;
        const sortColumns = options.sortColumns;
        const hasComparator = options.comparator !== undefined;
        const compareEntitySlots = createOIMEntitySlotsComparator<TEntity>(
            options.comparator ?? (sortColumns === undefined ? compareNothing : createOIMColumnsComparator(sortColumns)),
        );
        const computedValueService = new OIMComputedValueService<readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMSortedComputedSlot<TEntity, TKey, TSourceKey>>({
            derive: computedSlot => sortOIMBucketMemberSlots(computedSlot, bucketContentService, compareEntitySlots),
            sameValueGuard: isOIMSameSlotSequence,
        });
        super({
            slotContentService: new OIMExplicitSourceComputedContentService<readonly TOIMEntitySlot<TEntity, TSourceKey>[], TOIMSortedComputedSlot<TEntity, TKey, TSourceKey>>({
                computedValueService,
                createSources: computedSlot => createSortedComputedSources(
                computedSlot.key, computedSlot.storeSlot, indexService, sortColumns, hasComparator,
            ),
                initialValue: OIM_FROZEN_EMPTY_SLOTS as readonly TOIMEntitySlot<TEntity, TSourceKey>[],
            }),
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: options.slotStoreService,
            createColumnSlotOwner: createOIMPullColumnSlotOwner,
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            slotSubscriptionListener: options.slotSubscriptionListener,
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createSortedStoreSlot(
        indexStoreSlot: TOIMSlotCollectionIndexServiceStoreSlot<TKey, TEntity, TSlots, TSourceKey, TSourceStore>,
    ): TOIMStoreSlot<TComputedStore, TOIMSortedComputedSlot<TEntity, TKey, TSourceKey>, unknown, this> {
        return this.createStoreSlotOnChannel(indexStoreSlot.channelSlot, indexStoreSlot);
    }

    public createStoreAggregate(
        storeSlot: TOIMStoreSlot<TComputedStore, TOIMSortedComputedSlot<TEntity, TKey, TSourceKey>, unknown, this>,
    ): OIMSlotCollectionStoreAggregate<TKey, TOIMSortedComputedSlot<TEntity, TKey, TSourceKey>, TComputedStore, unknown, this> {
        return new OIMSlotCollectionStoreAggregate(this, storeSlot);
    }
}

function compareNothing(): number {
    return 0;
}

function createSortedComputedSources<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
>(
    key: TKey,
    storeSlot: TOIMStoreSlot,
    indexService: OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>,
    sortColumns: readonly TOIMSortColumn<TEntity>[] | undefined,
    hasComparator: boolean,
): Partial<TOIMComputedSources> {
    const indexStoreSlot = storeSlot.sourceStoreSlot as TOIMIndexStoreSlot as
        TOIMSlotCollectionIndexServiceStoreSlot<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
    const sourceSlots: TOIMSlot[] = [indexService.getSlotByKey(indexStoreSlot, key)];
    if (sortColumns !== undefined) {
        for (let i = 0; i < sortColumns.length; i++) {
            sourceSlots.push(indexService.getBucketColumnSlotByKey(indexStoreSlot, key, sortColumns[i].columnName));
        }
    } else if (hasComparator) {
        sourceSlots.push(indexService.getAnyBucketColumnSlotByKey(indexStoreSlot, key));
    }
    return { sourceSlots };
}
