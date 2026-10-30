import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMSourceTrackingComputedSlot } from './types/TOIMSourceTrackingComputedSlot';
import type { TOIMSourceTrackingComputedDerive } from './types/TOIMSourceTrackingComputedDerive';
import { OIMSourceTrackingComputedService } from './OIMSourceTrackingComputedService';
import { oimResolveSlotStoreService } from '../store/utils/oimResolveSlotStoreService';
import type { TOIMComputedServiceFactoryOptions } from './types/TOIMComputedServiceFactoryOptions';
import { oimResolveComputedDerivationOptions } from './utils/oimResolveComputedDerivationOptions';

export function createOIMSourceTrackingComputedService<
    TKey extends NonNullable<unknown>, TValue, TComputedStore = Map<TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>>,
>(
    options: TOIMComputedServiceFactoryOptions<TValue> & {
        derive: TOIMSourceTrackingComputedDerive<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>;
        computedSlotStoreService?: IOIMSlotStoreService<TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore> | undefined;
    },
): OIMSourceTrackingComputedService<TKey, TValue, TComputedStore> {
    return new OIMSourceTrackingComputedService<TKey, TValue, TComputedStore>({
        computedSlotStoreService: oimResolveSlotStoreService(options.computedSlotStoreService),
        ...oimResolveComputedDerivationOptions(options),
        derive: options.derive,
    });
}
