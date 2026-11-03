import type { TOIMComputedCarrierSlot } from './types/TOIMComputedCarrierSlot';
import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMSingleSlotStore } from '../store/types/TOIMSingleSlotStore';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { TOIMComputedDerivationOptions } from './types/TOIMComputedDerivationOptions';
import { OIMComputedValueService } from './OIMComputedValueService';
import type { OIMComputedContentService } from './OIMComputedContentService';
import { OIMExplicitSourceComputedContentService } from './OIMExplicitSourceComputedContentService';
import { OIMSingleSlotStoreService } from '../store/OIMSingleSlotStoreService';
import { createOIMPullColumnSlotOwner } from '../column/utils/createOIMPullColumnSlotOwner';
import { OIMSingleSlotService } from '../slot/OIMSingleSlotService';
import { attachOIMComputedDerivation } from './utils/attachOIMComputedDerivation';

export class OIMSingleComputedService<TValue> extends OIMSingleSlotService<
    TOIMComputedCarrierSlot<TValue>, OIMComputedContentService<TValue, TOIMComputedCarrierSlot<TValue>>,
    Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    private readonly hasDerive: boolean;

    private readonly hasCreateSources: boolean;

    public constructor(options: TOIMComputedDerivationOptions<TValue, TOIMComputedCarrierSlot<TValue>>) {
        super({
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<TOIMComputedCarrierSlot<TValue>>,
            slotContentService: new OIMExplicitSourceComputedContentService<TValue, TOIMComputedCarrierSlot<TValue>>({
                computedValueService: new OIMComputedValueService<TValue, TOIMComputedCarrierSlot<TValue>>({
                    derive: options.derive,
                    sameValueGuard: options.sameValueGuard,
                    releaseValue: options.releaseValue,
                }),
                createSources: options.createSources,
                initialValue: options.initialValue,
            }),
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            createColumnSlotOwner: createOIMPullColumnSlotOwner,
            storeSlotListener: options.storeSlotListener,
            slotSubscriptionListener: options.slotSubscriptionListener,
        });
        this.hasDerive = options.derive !== undefined;
        this.hasCreateSources = options.createSources !== undefined;
    }

    public override createStoreSlot(
        channelMap: IOIMChannelMap,
        derive?: ((computedSlot: TOIMComputedCarrierSlot<TValue>) => TValue) | undefined,
        createSources?: ((computedSlot: TOIMComputedCarrierSlot<TValue>) => Partial<TOIMComputedSources>) | undefined,
    ): TOIMComputedStoreSlot<TOIMSingleSlotStore<TOIMComputedCarrierSlot<TValue>>, TValue, TOIMComputedCarrierSlot<TValue>, this> {
        return attachOIMComputedDerivation(
            super.createStoreSlot(channelMap) as TOIMComputedStoreSlot<
                TOIMSingleSlotStore<TOIMComputedCarrierSlot<TValue>>, TValue, TOIMComputedCarrierSlot<TValue>, this
            >,
            this.hasDerive, this.hasCreateSources, derive, createSources,
        );
    }
}
