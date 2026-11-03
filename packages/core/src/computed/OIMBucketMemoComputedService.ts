import { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSlotCollectionStoreAggregate } from '../slot/OIMSlotCollectionStoreAggregate';
import { createOIMPullColumnSlotOwner } from '../column/utils/createOIMPullColumnSlotOwner';
import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { OIMPushColumnSlotOwner } from '../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { OIMBucketContentService } from '../bucket/OIMBucketContentService';
import type { TOIMBucketMemoComputedServiceOptions } from './types/TOIMBucketMemoComputedServiceOptions';
import type { TOIMBucketMemoComputedSlot } from './types/TOIMBucketMemoComputedSlot';
import type { OIMComputedContentService } from './OIMComputedContentService';
import { OIMExplicitSourceComputedContentService } from './OIMExplicitSourceComputedContentService';
import { isOIMSameSlotSequence } from '../bucket/utils/isOIMSameSlotSequence';
import { OIMComputedValueService } from './OIMComputedValueService';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';

type TOIMBucketSlotCollectionService<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore> =
    OIMSlotCollectionService<
        TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMBucketContentService<TBucketMemberSlot, TSlots>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TBucketMemberSlot[]
    >;

export class OIMBucketMemoComputedService<
    TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore, TComputedStore,
> extends OIMSlotCollectionService<
    TKey, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, TComputedStore,
    OIMComputedContentService<readonly TBucketMemberSlot[], TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>>, string, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    public constructor(options: TOIMBucketMemoComputedServiceOptions<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore>) {
        const bucketCollectionService = options.bucketCollectionService;
        const bucketContentService = bucketCollectionService.slotContentService;
        const computedValueService = new OIMComputedValueService<
            readonly TBucketMemberSlot[], TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>
        >({
            derive: computedSlot => deriveBucketMemo(computedSlot, bucketContentService),
            sameValueGuard: isOIMSameSlotSequence,
        });
        super({
            slotContentService: new OIMExplicitSourceComputedContentService<readonly TBucketMemberSlot[], TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>>({
                computedValueService,
                createSources: computedSlot => createBucketMemoComputedSources(computedSlot.key, computedSlot.storeSlot, bucketCollectionService),
                initialValue: OIM_FROZEN_EMPTY_SLOTS as readonly TBucketMemberSlot[],
            }),
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: options.slotStoreService,
            createColumnSlotOwner: createOIMPullColumnSlotOwner,
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            slotSubscriptionListener: options.slotSubscriptionListener,
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createBucketMemoStoreSlot(
        bucketStoreSlot: TOIMStoreSlot<TBucketStore, TOIMBucketSlot<TSlots, TKey>, readonly TBucketMemberSlot[]>,
    ): TOIMStoreSlot<TComputedStore, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, unknown, this> {
        return this.createStoreSlotOnChannel(bucketStoreSlot.channelSlot, bucketStoreSlot);
    }

    public createStoreAggregate(
        storeSlot: TOIMStoreSlot<TComputedStore, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, unknown, this>,
    ): OIMSlotCollectionStoreAggregate<TKey, TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>, TComputedStore, unknown, this> {
        return new OIMSlotCollectionStoreAggregate(this, storeSlot);
    }
}

function deriveBucketMemo<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots>(
    computedSlot: TOIMBucketMemoComputedSlot<TBucketMemberSlot, TKey>,
    bucketContentService: OIMBucketContentService<TBucketMemberSlot, TSlots>,
): readonly TBucketMemberSlot[] {
    return Array.from(bucketContentService.getBucketMemberSlots(computedSlot.sourceSlots[0] as TOIMBucketSlot<TSlots>));
}

function createBucketMemoComputedSources<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore>(
    key: TKey,
    storeSlot: TOIMStoreSlot,
    bucketCollectionService: TOIMBucketSlotCollectionService<TKey, TBucketMemberSlot, TSlots, TBucketStore>,
): Partial<TOIMComputedSources> {
    const bucketStoreSlot = storeSlot.sourceStoreSlot as TOIMStoreSlot<
        TBucketStore, TOIMBucketSlot<TSlots, TKey>, readonly TBucketMemberSlot[]
    >;
    return { sourceSlots: [bucketCollectionService.getSlotByKey(bucketStoreSlot, key)] };
}
