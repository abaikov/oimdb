import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from './types/TOIMComputedStoreSlot';
import type { TOIMComputedServiceOptions } from './types/TOIMComputedServiceOptions';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import { OIMComputedValueService } from './OIMComputedValueService';
import { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSlotCollectionStoreAggregate } from '../slot/OIMSlotCollectionStoreAggregate';
import { createOIMPullColumnSlotOwner } from '../column/utils/createOIMPullColumnSlotOwner';
import type { OIMPullColumnSlotOwner } from '../column/OIMPullColumnSlotOwner';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { OIMComputedContentService } from './OIMComputedContentService';
import { OIMExplicitSourceComputedContentService } from './OIMExplicitSourceComputedContentService';
import { oimAttachComputedDerivation } from './utils/oimAttachComputedDerivation';

export class OIMComputedService<TKey extends NonNullable<unknown>, TValue, TComputedStore> extends OIMSlotCollectionService<
    TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore, OIMComputedContentService<TValue, TOIMComputedSlot<TValue, TKey>>, Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    private readonly hasDerive: boolean;

    private readonly hasCreateSources: boolean;

    public constructor(options: TOIMComputedServiceOptions<TKey, TValue, TComputedStore>) {
        super({
            slotContentService: new OIMExplicitSourceComputedContentService<TValue, TOIMComputedSlot<TValue, TKey>>({
                computedValueService: new OIMComputedValueService<TValue, TOIMComputedSlot<TValue, TKey>>({
                    derive: options.derive,
                    sameValueGuard: options.sameValueGuard,
                    releaseValue: options.releaseValue,
                }),
                createSources: options.createSources,
                initialValue: options.initialValue,
            }),
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: options.computedSlotStoreService,
            createColumnSlotOwner: createOIMPullColumnSlotOwner,
            columnSlotOwnerOptions: options.columnSlotOwnerOptions,
            storeSlotListener: options.storeSlotListener,
        });
        this.hasDerive = options.derive !== undefined;
        this.hasCreateSources = options.createSources !== undefined;
    }

    public createStoreSlot(
        channelMap: IOIMChannelMap,
        derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined,
        createSources?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => Partial<TOIMComputedSources>) | undefined,
    ): TOIMComputedStoreSlot<TComputedStore, TValue, TOIMComputedSlot<TValue, TKey>, this> {
        return oimAttachComputedDerivation(
            this.createStoreSlotOnChannel(channelMap.defaultChannelSlot) as
                TOIMComputedStoreSlot<TComputedStore, TValue, TOIMComputedSlot<TValue, TKey>, this>,
            this.hasDerive, this.hasCreateSources, derive, createSources,
        );
    }

    public createStoreAggregate(
        storeSlot: TOIMStoreSlot<TComputedStore, TOIMComputedSlot<TValue, TKey>, unknown, this>,
    ): OIMSlotCollectionStoreAggregate<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore, unknown, this> {
        return new OIMSlotCollectionStoreAggregate(this, storeSlot);
    }
}
