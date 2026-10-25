import type { OIMPullColumnSlotOwner } from '../../engine/column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedContentSlot } from '../../engine/computed/types/TOIMComputedContentSlot';
import type { TOIMComputedSources } from '../../engine/computed/types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from '../../engine/computed/types/TOIMComputedStoreSlot';
import type { TOIMSingleSlotStore } from '../../engine/store/types/TOIMSingleSlotStore';
import type { IOIMChannelMap } from '../../engine/channel/interfaces/IOIMChannelMap';
import type { TOIMComputedDerivationOptions } from './types/TOIMComputedDerivationOptions';
import { OIMComputedValueService } from '../../engine/computed/OIMComputedValueService';
import { OIMSlotContentComputedService } from '../../engine/computed/OIMSlotContentComputedService';
import { OIMSingleSlotStoreService } from '../../engine/store/OIMSingleSlotStoreService';
import { createOIMPullColumnSlotOwner } from '../../engine/column/utils/createOIMPullColumnSlotOwner';
import { OIMSingleSlotService } from '../slot/OIMSingleSlotService';
import { oimAttachComputedDerivation } from './utils/oimAttachComputedDerivation';

export class OIMSingleComputedService<TValue> {
    public readonly computedSingleSlotService: OIMSingleSlotService<
        TOIMComputedContentSlot<TValue>, OIMSlotContentComputedService<TValue>,
        Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >;

    private readonly hasDerive: boolean;

    private readonly hasCreateSources: boolean;

    public constructor(options: TOIMComputedDerivationOptions<TValue, TOIMComputedContentSlot<TValue>>) {
        this.computedSingleSlotService = new OIMSingleSlotService<
            TOIMComputedContentSlot<TValue>, OIMSlotContentComputedService<TValue>,
            Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
        >({
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<TOIMComputedContentSlot<TValue>>,
            slotContentService: new OIMSlotContentComputedService<TValue>({
                computedValueService: new OIMComputedValueService<TValue>({
                    derive: options.derive,
                    sameValueGuard: options.sameValueGuard,
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

    public createComputedStoreSlot(
        channelMap: IOIMChannelMap,
        derive?: ((computedSlot: TOIMComputedContentSlot<TValue>) => TValue) | undefined,
        createSources?: ((computedSlot: TOIMComputedContentSlot<TValue>) => Partial<TOIMComputedSources>) | undefined,
    ): TOIMComputedStoreSlot<TOIMSingleSlotStore<TOIMComputedContentSlot<TValue>>, TValue> {
        return oimAttachComputedDerivation(
            this.computedSingleSlotService.createStoreSlot(channelMap) as
                TOIMComputedStoreSlot<TOIMSingleSlotStore<TOIMComputedContentSlot<TValue>>, TValue>,
            this.hasDerive, this.hasCreateSources, derive, createSources,
        );
    }
}
