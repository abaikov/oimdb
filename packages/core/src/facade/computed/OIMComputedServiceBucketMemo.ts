import type { OIMColumnOwnerPushDriven } from '../../engine/column/OIMColumnOwnerPushDriven';
import type { OIMColumnOwnerPullDriven } from '../../engine/column/OIMColumnOwnerPullDriven';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMComputedSources } from '../../engine/computed/types/TOIMComputedSources';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { OIMSlotContentBucketService } from '../bucket/OIMSlotContentBucketService';
import type { TOIMComputedServiceBucketMemoOptions } from './types/TOIMComputedServiceBucketMemoOptions';
import type { TOIMBucketMemoComputedSlot } from './types/TOIMBucketMemoComputedSlot';
import { createOIMComputedCollectionService } from './utils/createOIMComputedCollectionService';
import { oimSameSlotSequence } from '../../engine/bucket/utils/oimSameSlotSequence';
import { OIMComputedValueService } from '../../engine/computed/OIMComputedValueService';
import { OIM_FROZEN_EMPTY_SLOTS } from '../../engine/slot/constants/OIM_FROZEN_EMPTY_SLOTS';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';

type TOIMBucketSlotCollectionService<TKey, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore> = OIMSlotCollectionService<
    TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
    string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TBucketMemberSlot[]
>;

export class OIMComputedServiceBucketMemo<TKey, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore, TComputedStore> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, TComputedStore,
        OIMComputedValueService<TKey, readonly TBucketMemberSlot[]>,
        string, TOIMComputedColumnSlot, OIMColumnOwnerPullDriven
    >;

    public constructor(options: TOIMComputedServiceBucketMemoOptions<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore>) {
        const bucketCollectionService = options.bucketCollectionService;
        const bucketContentService = bucketCollectionService.slotContentService;
        const computedValueService = new OIMComputedValueService<TKey, readonly TBucketMemberSlot[]>({
            derive: computedSlot => deriveBucketMemo(computedSlot, bucketContentService),
            sameValueGuard: oimSameSlotSequence,
        });
        this.computedCollectionService = createOIMComputedCollectionService<
            TKey, readonly TBucketMemberSlot[], TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, TComputedStore, string
        >({
            computedValueService,
            createSources: (key, storeSlot) => createBucketMemoSources(key, storeSlot, bucketCollectionService),
            initialValue: OIM_FROZEN_EMPTY_SLOTS as readonly TBucketMemberSlot[],
            slotReleasePolicy: options.slotReleasePolicy,
            computedSlotStoreService: options.computedSlotStoreService,
            columnOwnerOptions: { columnSlotStoreService: options.columnSlotStoreService },
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createBucketMemoStoreSlot(
        bucketStoreSlot: TOIMStoreSlot<TBucketStore, TOIMBucketSlot<TSlots, TKey>, readonly TBucketMemberSlot[]>,
    ): TOIMStoreSlot<TComputedStore, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>> {
        return this.computedCollectionService.createStoreSlotFrom(bucketStoreSlot);
    }
}

function deriveBucketMemo<TKey, TBucketMemberSlot extends TOIMSlot, TSlots>(
    computedSlot: TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>,
    bucketContentService: OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
): readonly TBucketMemberSlot[] {
    return Array.from(bucketContentService.getBucketMemberSlots(computedSlot.sourceSlots[0] as TOIMBucketSlot<TSlots>));
}

function createBucketMemoSources<TKey, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore>(
    key: TKey,
    storeSlot: TOIMStoreSlot | undefined,
    bucketCollectionService: TOIMBucketSlotCollectionService<TKey, TBucketMemberSlot, TSlots, TBucketStore>,
): Partial<TOIMComputedSources> {
    const bucketStoreSlot = (storeSlot as TOIMStoreSlot).sourceStoreSlot as TOIMStoreSlot<
        TBucketStore, TOIMBucketSlot<TSlots, TKey>, readonly TBucketMemberSlot[]
    >;
    return { sourceSlots: [bucketCollectionService.getSlotByKey(bucketStoreSlot, key)] };
}
