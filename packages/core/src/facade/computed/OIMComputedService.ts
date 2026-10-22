import type { OIMColumnOwnerPullDriven } from '../../engine/column/OIMColumnOwnerPullDriven';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../../engine/computed/types/TOIMComputedSlot';
import type { TOIMComputedSources } from '../../engine/computed/types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from '../../engine/computed/types/TOIMComputedStoreSlot';
import type { TOIMSlotEditable } from '../../engine/slot/types/TOIMSlotEditable';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMComputedServiceOptions } from './types/TOIMComputedServiceOptions';
import type { IOIMChannelMap } from '../../engine/channel/interfaces/IOIMChannelMap';
import { OIMComputedValueService } from '../../engine/computed/OIMComputedValueService';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { createOIMComputedCollectionService } from './utils/createOIMComputedCollectionService';

export class OIMComputedService<TKey, TValue, TComputedStore> {
    public readonly computedCollectionService: OIMSlotCollectionService<
        TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore, OIMComputedValueService<TKey, TValue>,
        Extract<keyof TValue, string>, TOIMComputedColumnSlot, OIMColumnOwnerPullDriven
    >;

    private readonly hasDerive: boolean;

    private readonly hasCreateSources: boolean;

    public constructor(options: TOIMComputedServiceOptions<TKey, TValue, TComputedStore>) {
        const computedValueService = new OIMComputedValueService<TKey, TValue>({
            derive: options.derive,
            sameValueGuard: options.sameValueGuard,
        });
        this.computedCollectionService = createOIMComputedCollectionService<
            TKey, TValue, TOIMComputedSlot<TValue, TKey>, TComputedStore, Extract<keyof TValue, string>
        >({
            computedValueService,
            createSources: options.createSources,
            initialValue: options.initialValue,
            slotReleasePolicy: options.slotReleasePolicy,
            computedSlotStoreService: options.computedSlotStoreService,
            columnOwnerOptions: options.columnOwnerOptions,
            storeSlotListener: options.storeSlotListener,
        });
        this.hasDerive = options.derive !== undefined;
        this.hasCreateSources = options.createSources !== undefined;
    }

    public createComputedStoreSlot(
        channelMap: IOIMChannelMap,
        derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined,
        createSources?: ((key: TKey, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>) | undefined,
    ): TOIMComputedStoreSlot<TComputedStore, TValue, TKey> {
        this.assertDeriveAndCreateSources(derive !== undefined, createSources !== undefined);
        const computedStoreSlot = this.computedCollectionService.createStoreSlot(channelMap) as
            TOIMSlotEditable<TOIMComputedStoreSlot<TComputedStore, TValue, TKey>>;
        computedStoreSlot.derive = derive;
        computedStoreSlot.createSources = createSources;
        return computedStoreSlot;
    }

    private assertDeriveAndCreateSources(hasStoreSlotDerive: boolean, hasStoreSlotCreateSources: boolean): void {
        if ((hasStoreSlotDerive || this.hasDerive) && (hasStoreSlotCreateSources || this.hasCreateSources)) return;
        throw new Error(
            'OIMComputedService: a computed store slot needs a derive and a createSources, from the store slot or from '
            + 'the service options. Pass the missing one to createComputedStoreSlot or to the service.',
        );
    }
}
