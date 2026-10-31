import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMComputedServiceOptions } from './types/TOIMComputedServiceOptions';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import { OIMComputedValueService } from './OIMComputedValueService';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSlotContentComputedService } from './OIMSlotContentComputedService';
import { createOIMComputedSlotCollectionService } from './utils/createOIMComputedSlotCollectionService';
import { oimAttachComputedDerivation } from './utils/oimAttachComputedDerivation';

export class OIMComputedService<TKey extends NonNullable<unknown>, TValue, TComputedStore> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore, OIMSlotContentComputedService<TValue, TOIMComputedSlot<TValue, TKey>>,
        Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >;

    private readonly hasDerive: boolean;

    private readonly hasCreateSources: boolean;

    public constructor(options: TOIMComputedServiceOptions<TKey, TValue, TComputedStore>) {
        this.computedCollectionService = createOIMComputedSlotCollectionService<
            TKey, TValue, TOIMComputedSlot<TValue, TKey>, TComputedStore, Extract<keyof TValue, string>
        >({
            slotContentService: new OIMSlotContentComputedService<TValue, TOIMComputedSlot<TValue, TKey>>({
                computedValueService: new OIMComputedValueService<TValue, TOIMComputedSlot<TValue, TKey>>({
                    derive: options.derive,
                    sameValueGuard: options.sameValueGuard,
                    releaseValue: options.releaseValue,
                }),
                createSources: options.createSources,
                initialValue: options.initialValue,
            }),
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
    ): TOIMComputedStoreSlot<TComputedStore, TValue, TOIMComputedSlot<TValue, TKey>, this['computedCollectionService']> {
        return oimAttachComputedDerivation(
            this.computedCollectionService.createStoreSlot(channelMap) as
                TOIMComputedStoreSlot<TComputedStore, TValue, TOIMComputedSlot<TValue, TKey>, this['computedCollectionService']>,
            this.hasDerive, this.hasCreateSources, derive, createSources,
        );
    }
}
