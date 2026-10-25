import type { OIMPullColumnSlotOwner } from '../../engine/column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../../engine/computed/types/TOIMComputedSlot';
import type { TOIMComputedSources } from '../../engine/computed/types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from '../../engine/computed/types/TOIMComputedStoreSlot';
import type { TOIMComputedServiceOptions } from './types/TOIMComputedServiceOptions';
import type { IOIMChannelMap } from '../../engine/channel/interfaces/IOIMChannelMap';
import type { OIMSlotContentComputedService } from '../../engine/computed/OIMSlotContentComputedService';
import { OIMComputedValueService } from '../../engine/computed/OIMComputedValueService';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { createOIMComputedCollectionService } from './utils/createOIMComputedCollectionService';
import { oimAttachComputedDerivation } from './utils/oimAttachComputedDerivation';

export class OIMComputedService<TKey extends NonNullable<unknown>, TValue, TComputedStore> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore, OIMSlotContentComputedService<TValue, TOIMComputedSlot<TValue, TKey>>,
        Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >;

    private readonly hasDerive: boolean;

    private readonly hasCreateSources: boolean;

    public constructor(options: TOIMComputedServiceOptions<TKey, TValue, TComputedStore>) {
        this.computedCollectionService = createOIMComputedCollectionService<
            TKey, TValue, TOIMComputedSlot<TValue, TKey>, TComputedStore, Extract<keyof TValue, string>
        >({
            computedValueService: new OIMComputedValueService<TValue, TOIMComputedSlot<TValue, TKey>>({
                derive: options.derive,
                sameValueGuard: options.sameValueGuard,
            }),
            createSources: options.createSources,
            initialValue: options.initialValue,
            slotReleasePolicy: options.slotReleasePolicy,
            computedSlotStoreService: options.computedSlotStoreService,
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            storeSlotListener: options.storeSlotListener,
        });
        this.hasDerive = options.derive !== undefined;
        this.hasCreateSources = options.createSources !== undefined;
    }

    public createComputedStoreSlot(
        channelMap: IOIMChannelMap,
        derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined,
        createSources?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => Partial<TOIMComputedSources>) | undefined,
    ): TOIMComputedStoreSlot<TComputedStore, TValue, TOIMComputedSlot<TValue, TKey>> {
        return oimAttachComputedDerivation(
            this.computedCollectionService.createStoreSlot(channelMap) as TOIMComputedStoreSlot<TComputedStore, TValue, TOIMComputedSlot<TValue, TKey>>,
            this.hasDerive, this.hasCreateSources, derive, createSources,
        );
    }
}
