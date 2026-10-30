import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import type { TOIMSingleSlotStore } from '../store/types/TOIMSingleSlotStore';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMSourceTrackingComputedDerivationOptions } from './types/TOIMSourceTrackingComputedDerivationOptions';
import { OIMSourceTrackingComputedValueService } from './OIMSourceTrackingComputedValueService';
import { OIMSlotContentSourceTrackingComputedService } from './OIMSlotContentSourceTrackingComputedService';
import { OIMSingleSlotStoreService } from '../store/OIMSingleSlotStoreService';
import { createOIMPullColumnSlotOwner } from '../column/utils/createOIMPullColumnSlotOwner';
import { OIMSingleSlotService } from '../slot/OIMSingleSlotService';

export class OIMSingleSourceTrackingComputedService<TValue> {
    public readonly computedSingleSlotService: OIMSingleSlotService<
        TOIMSourceTrackingComputedContentSlot<TValue>, OIMSlotContentSourceTrackingComputedService<TValue>,
        Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >;

    public constructor(options: TOIMSourceTrackingComputedDerivationOptions<TValue, TOIMSourceTrackingComputedContentSlot<TValue>>) {
        this.computedSingleSlotService = new OIMSingleSlotService<
            TOIMSourceTrackingComputedContentSlot<TValue>, OIMSlotContentSourceTrackingComputedService<TValue>,
            Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
        >({
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<TOIMSourceTrackingComputedContentSlot<TValue>>,
            slotContentService: new OIMSlotContentSourceTrackingComputedService<TValue>({
                computedValueService: new OIMSourceTrackingComputedValueService<TValue>({
                    derive: options.derive,
                    sameValueGuard: options.sameValueGuard,
                    releaseValue: options.releaseValue,
                }),
                initialValue: options.initialValue,
            }),
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            createColumnSlotOwner: createOIMPullColumnSlotOwner,
            storeSlotListener: options.storeSlotListener,
        });
    }

    public createComputedStoreSlot(
        channelMap: IOIMChannelMap,
    ): TOIMStoreSlot<TOIMSingleSlotStore<TOIMSourceTrackingComputedContentSlot<TValue>>, TOIMSourceTrackingComputedContentSlot<TValue>> {
        return this.computedSingleSlotService.createStoreSlot(channelMap);
    }
}
