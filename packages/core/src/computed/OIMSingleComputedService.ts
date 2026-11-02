import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
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
import { oimAttachComputedDerivation } from './utils/oimAttachComputedDerivation';

export class OIMSingleComputedService<TValue> extends OIMSingleSlotService<
    TOIMComputedContentSlot<TValue>, OIMComputedContentService<TValue>,
    Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    private readonly hasDerive: boolean;

    private readonly hasCreateSources: boolean;

    public constructor(options: TOIMComputedDerivationOptions<TValue, TOIMComputedContentSlot<TValue>>) {
        super({
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<TOIMComputedContentSlot<TValue>>,
            slotContentService: new OIMExplicitSourceComputedContentService<TValue>({
                computedValueService: new OIMComputedValueService<TValue>({
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
        });
        this.hasDerive = options.derive !== undefined;
        this.hasCreateSources = options.createSources !== undefined;
    }

    public override createStoreSlot(
        channelMap: IOIMChannelMap,
        derive?: ((computedSlot: TOIMComputedContentSlot<TValue>) => TValue) | undefined,
        createSources?: ((computedSlot: TOIMComputedContentSlot<TValue>) => Partial<TOIMComputedSources>) | undefined,
    ): TOIMComputedStoreSlot<TOIMSingleSlotStore<TOIMComputedContentSlot<TValue>>, TValue, TOIMComputedContentSlot<TValue>, this> {
        return oimAttachComputedDerivation(
            super.createStoreSlot(channelMap) as TOIMComputedStoreSlot<
                TOIMSingleSlotStore<TOIMComputedContentSlot<TValue>>, TValue, TOIMComputedContentSlot<TValue>, this
            >,
            this.hasDerive, this.hasCreateSources, derive, createSources,
        );
    }
}
