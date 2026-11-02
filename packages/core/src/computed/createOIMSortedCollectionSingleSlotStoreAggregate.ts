import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMSortColumn } from './types/TOIMSortColumn';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMSlotCollectionStoreSlot } from '../bucket/types/TOIMSlotCollectionStoreSlot';
import type { OIMSingleSlotStoreAggregate } from '../slot/OIMSingleSlotStoreAggregate';
import type { OIMSingleComputedService } from './OIMSingleComputedService';
import { OIMSlotCollectionBucketService } from '../bucket/OIMSlotCollectionBucketService';
import { createOIMSingleComputedService } from './createOIMSingleComputedService';
import { oimSortBucketMemberSlots } from './utils/oimSortBucketMemberSlots';
import { oimEntitySlotsComparator } from './utils/oimEntitySlotsComparator';
import { oimColumnsComparator } from './utils/oimColumnsComparator';
import { oimSameSlotSequence } from '../bucket/utils/oimSameSlotSequence';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';

type TCollectionBucketContentService<TEntity extends object> = {
    getBucketMemberSlots(bucketSlot: TOIMBucketSlot<unknown>): Iterable<TOIMEntitySlot<TEntity, TOIMStoreKey>>;
};

export function createOIMSortedCollectionSingleSlotStoreAggregate<TEntity extends object>(
    entitySlotCollectionStoreAggregate: { readonly storeSlot: TOIMSlotCollectionStoreSlot<TOIMEntitySlot<TEntity, TOIMStoreKey>> },
    options: { sortColumns?: readonly TOIMSortColumn<TEntity>[] | undefined; comparator?: ((left: TEntity, right: TEntity) => number) | undefined },
): OIMSingleSlotStoreAggregate<TOIMComputedContentSlot<readonly TOIMEntitySlot<TEntity, TOIMStoreKey>[]>, unknown, OIMSingleComputedService<readonly TOIMEntitySlot<TEntity, TOIMStoreKey>[]>> {
    const collectionStoreSlot = entitySlotCollectionStoreAggregate.storeSlot;
    const collectionBucketService = OIMSlotCollectionBucketService.INSTANCE;
    const sortColumns = options.sortColumns;
    const comparator = options.comparator;
    const compareEntitySlots = oimEntitySlotsComparator<TEntity>(
        comparator ?? (sortColumns === undefined ? compareNothing : oimColumnsComparator(sortColumns)),
    );
    const sortedComputedService = createOIMSingleComputedService<readonly TOIMEntitySlot<TEntity, TOIMStoreKey>[]>({
        sameValueGuard: oimSameSlotSequence,
        initialValue: OIM_FROZEN_EMPTY_SLOTS,
        createSources: () => {
            const sourceSlots: TOIMSlot[] = [collectionBucketService.getBucketSlot(collectionStoreSlot)];
            if (comparator !== undefined) sourceSlots.push(collectionBucketService.getAnyBucketColumn(collectionStoreSlot));
            else if (sortColumns !== undefined) {
                for (let i = 0; i < sortColumns.length; i++) sourceSlots.push(collectionBucketService.getBucketColumn(collectionStoreSlot, sortColumns[i].columnName));
            }
            return { sourceSlots };
        },
        derive: computedSlot => oimSortBucketMemberSlots<TEntity, unknown, TOIMStoreKey>(
            computedSlot,
            (computedSlot.sourceSlots[0].owner as unknown as { readonly slotContentService: TCollectionBucketContentService<TEntity> }).slotContentService,
            compareEntitySlots,
        ),
    });
    return sortedComputedService.createStoreAggregate(
        sortedComputedService.createStoreSlot({ defaultChannelSlot: collectionStoreSlot.channelSlot }),
    );
}

function compareNothing(): number {
    return 0;
}
