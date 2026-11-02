import type { TOIMSourceTrackingComputedSlot } from './types/TOIMSourceTrackingComputedSlot';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMSourceTrackingComputedDerivationOptions } from './types/TOIMSourceTrackingComputedDerivationOptions';
import { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSlotCollectionStoreAggregate } from '../slot/OIMSlotCollectionStoreAggregate';
import { createOIMPullColumnSlotOwner } from '../column/utils/createOIMPullColumnSlotOwner';
import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import { OIMSourceTrackingComputedValueService } from './OIMSourceTrackingComputedValueService';
import { OIMSourceTrackingComputedContentService } from './OIMSourceTrackingComputedContentService';

export class OIMSourceTrackingComputedService<TKey extends NonNullable<unknown>, TValue, TComputedStore> extends OIMSlotCollectionService<
    TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore,
    OIMSourceTrackingComputedContentService<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>, Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    public constructor(
        options: TOIMSourceTrackingComputedDerivationOptions<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>> & {
            computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore>;
        },
    ) {
        super({
            slotContentService: new OIMSourceTrackingComputedContentService<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>({
                computedValueService: new OIMSourceTrackingComputedValueService<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>({
                    derive: options.derive,
                    sameValueGuard: options.sameValueGuard,
                    releaseValue: options.releaseValue,
                }),
                initialValue: options.initialValue,
            }),
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: options.computedSlotStoreService,
            createColumnSlotOwner: createOIMPullColumnSlotOwner,
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createStoreSlot(
        channelMap: IOIMChannelMap,
    ): TOIMStoreSlot<TComputedStore, TOIMSourceTrackingComputedSlot<TValue, TKey>, unknown, this> {
        return this.createStoreSlotOnChannel(channelMap.defaultChannelSlot);
    }

    public createStoreAggregate(
        storeSlot: TOIMStoreSlot<TComputedStore, TOIMSourceTrackingComputedSlot<TValue, TKey>, unknown, this>,
    ): OIMSlotCollectionStoreAggregate<TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore, unknown, this> {
        return new OIMSlotCollectionStoreAggregate(this, storeSlot);
    }
}
