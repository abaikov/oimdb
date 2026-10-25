import type { OIMPushColumnSlotOwner } from '../../engine/column/OIMPushColumnSlotOwner';
import type { OIMPullColumnSlotOwner } from '../../engine/column/OIMPullColumnSlotOwner';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMComputedSources } from '../../engine/computed/types/TOIMComputedSources';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { OIMSlotContentBucketService } from '../bucket/OIMSlotContentBucketService';
import type { TOIMBucketMemoComputedServiceOptions } from './types/TOIMBucketMemoComputedServiceOptions';
import type { TOIMBucketMemoComputedSlot } from './types/TOIMBucketMemoComputedSlot';
import { createOIMComputedCollectionService } from './utils/createOIMComputedCollectionService';
import { oimSameSlotSequence } from '../../engine/bucket/utils/oimSameSlotSequence';
import { OIMComputedValueService } from '../../engine/computed/OIMComputedValueService';
import type { OIMSlotContentComputedService } from '../../engine/computed/OIMSlotContentComputedService';
import { OIM_FROZEN_EMPTY_SLOTS } from '../../engine/slot/constants/OIM_FROZEN_EMPTY_SLOTS';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';

type TOIMBucketSlotCollectionService<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore> =
    OIMSlotCollectionService<
        TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TBucketMemberSlot[]
    >;

export class OIMBucketMemoComputedService<
    TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore, TComputedStore,
> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, TComputedStore,
        OIMSlotContentComputedService<readonly TBucketMemberSlot[], TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>>,
        string, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >;

    public constructor(options: TOIMBucketMemoComputedServiceOptions<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore>) {
        const bucketCollectionService = options.bucketCollectionService;
        const bucketContentService = bucketCollectionService.slotContentService;
        const computedValueService = new OIMComputedValueService<
            readonly TBucketMemberSlot[], TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>
        >({
            derive: computedSlot => deriveBucketMemo(computedSlot, bucketContentService),
            sameValueGuard: oimSameSlotSequence,
        });
        this.computedCollectionService = createOIMComputedCollectionService<
            TKey, readonly TBucketMemberSlot[], TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, TComputedStore, string
        >({
            computedValueService,
            createSources: computedSlot => createBucketMemoSources(computedSlot.key, computedSlot.storeSlot, bucketCollectionService),
            initialValue: OIM_FROZEN_EMPTY_SLOTS as readonly TBucketMemberSlot[],
            slotReleasePolicy: options.slotReleasePolicy,
            computedSlotStoreService: options.computedSlotStoreService,
            columnSlotOwnerOptions: { columnSlotStoreService: options.columnSlotStoreService },
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createBucketMemoStoreSlot(
        bucketStoreSlot: TOIMStoreSlot<TBucketStore, TOIMBucketSlot<TSlots, TKey>, readonly TBucketMemberSlot[]>,
    ): TOIMStoreSlot<TComputedStore, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>> {
        return this.computedCollectionService.createStoreSlotFrom(bucketStoreSlot);
    }
}

function deriveBucketMemo<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots>(
    computedSlot: TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>,
    bucketContentService: OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
): readonly TBucketMemberSlot[] {
    return Array.from(bucketContentService.getBucketMemberSlots(computedSlot.sourceSlots[0] as TOIMBucketSlot<TSlots>));
}

function createBucketMemoSources<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore>(
    key: TKey,
    storeSlot: TOIMStoreSlot | undefined,
    bucketCollectionService: TOIMBucketSlotCollectionService<TKey, TBucketMemberSlot, TSlots, TBucketStore>,
): Partial<TOIMComputedSources> {
    const bucketStoreSlot = (storeSlot as TOIMStoreSlot).sourceStoreSlot as TOIMStoreSlot<
        TBucketStore, TOIMBucketSlot<TSlots, TKey>, readonly TBucketMemberSlot[]
    >;
    return { sourceSlots: [bucketCollectionService.getSlotByKey(bucketStoreSlot, key)] };
}
