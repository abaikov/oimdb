import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import type { TOIMSourceTrackingComputedDerivationOptions } from './types/TOIMSourceTrackingComputedDerivationOptions';
import { OIMSourceTrackingComputedValueService } from './OIMSourceTrackingComputedValueService';
import { OIMSourceTrackingComputedContentService } from './OIMSourceTrackingComputedContentService';
import { OIMSingleSlotStoreService } from '../store/OIMSingleSlotStoreService';
import { createOIMPullColumnSlotOwner } from '../column/utils/createOIMPullColumnSlotOwner';
import { OIMSingleSlotService } from '../slot/OIMSingleSlotService';

export class OIMSingleSourceTrackingComputedService<TValue> extends OIMSingleSlotService<
    TOIMSourceTrackingComputedContentSlot<TValue>, OIMSourceTrackingComputedContentService<TValue>,
    Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    public constructor(options: TOIMSourceTrackingComputedDerivationOptions<TValue, TOIMSourceTrackingComputedContentSlot<TValue>>) {
        super({
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<TOIMSourceTrackingComputedContentSlot<TValue>>,
            slotContentService: new OIMSourceTrackingComputedContentService<TValue>({
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
}
