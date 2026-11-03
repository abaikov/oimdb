import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMSourceTrackingComputedSlot } from './types/TOIMSourceTrackingComputedSlot';
import type { TOIMSourceTrackingComputedDerive } from './types/TOIMSourceTrackingComputedDerive';
import { OIMSourceTrackingComputedService } from './OIMSourceTrackingComputedService';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';
import type { TOIMComputedServiceFactoryOptions } from './types/TOIMComputedServiceFactoryOptions';
import { resolveOIMComputedDerivationOptions } from './utils/resolveOIMComputedDerivationOptions';

export function createOIMSourceTrackingComputedService<
    TKey extends NonNullable<unknown>, TValue, TComputedStore = Map<TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>>,
>(
    options: TOIMComputedServiceFactoryOptions<TValue> & {
        derive: TOIMSourceTrackingComputedDerive<TValue, TOIMSourceTrackingComputedSlot<TValue, TKey>>;
        slotStoreService?: IOIMSlotStoreService<TKey, TOIMSourceTrackingComputedSlot<TValue, TKey>, TComputedStore> | undefined;
    },
): OIMSourceTrackingComputedService<TKey, TValue, TComputedStore> {
    return new OIMSourceTrackingComputedService<TKey, TValue, TComputedStore>({
        slotStoreService: resolveOIMSlotStoreService(options.slotStoreService),
        ...resolveOIMComputedDerivationOptions(options),
        derive: options.derive,
    });
}
