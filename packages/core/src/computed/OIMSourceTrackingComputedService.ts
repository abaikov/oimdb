import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMSourceTrackingComputedSlot } from './types/TOIMSourceTrackingComputedSlot';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMSourceTrackingComputedDerivationOptions } from './types/TOIMSourceTrackingComputedDerivationOptions';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSourceTrackingComputedValueService } from './OIMSourceTrackingComputedValueService';
import { OIMSlotContentSourceTrackingComputedService } from './OIMSlotContentSourceTrackingComputedService';
import { createOIMComputedSlotCollectionService } from './utils/createOIMComputedSlotCollectionService';

export class OIMSourceTrackingComputedService<TKey extends NonNullable<unknown>, TValue, TComputedStore> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore,
        OIMSlotContentSourceTrackingComputedService<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>,
        Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >;

    public constructor(
        options: TOIMSourceTrackingComputedDerivationOptions<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>> & {
            computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore>;
        },
    ) {
        this.computedCollectionService = createOIMComputedSlotCollectionService<
            TKey, TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore, Extract<keyof TValue, string>,
            OIMSlotContentSourceTrackingComputedService<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>
        >({
            slotContentService: new OIMSlotContentSourceTrackingComputedService<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>({
                computedValueService: new OIMSourceTrackingComputedValueService<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>({
                    derive: options.derive,
                    sameValueGuard: options.sameValueGuard,
                    releaseValue: options.releaseValue,
                }),
                initialValue: options.initialValue,
            }),
            slotReleasePolicy: options.slotReleasePolicy,
            computedSlotStoreService: options.computedSlotStoreService,
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createComputedStoreSlot(
        channelMap: IOIMChannelMap,
    ): TOIMStoreSlot<TComputedStore, TOIMSourceTrackingComputedSlot<TValue, TKey>, unknown, this['computedCollectionService']> {
        return this.computedCollectionService.createStoreSlot(channelMap);
    }
}
