import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMComputedSources } from './types/TOIMComputedSources';
import { OIMComputedService } from './OIMComputedService';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';
import type { TOIMComputedServiceFactoryOptions } from './types/TOIMComputedServiceFactoryOptions';
import { resolveOIMComputedDerivationOptions } from './utils/resolveOIMComputedDerivationOptions';

export function createOIMComputedService<
    TKey extends NonNullable<unknown>, TValue, TComputedStore = Map<TKey, TOIMComputedSlot<TValue, TKey>>,
>(
    options: TOIMComputedServiceFactoryOptions<TValue> & {
        createSources?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => Partial<TOIMComputedSources>) | undefined;
        derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined;
        slotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore> | undefined;
    },
): OIMComputedService<TKey, TValue, TComputedStore> {
    return new OIMComputedService<TKey, TValue, TComputedStore>({
        slotStoreService: resolveOIMSlotStoreService(options.slotStoreService),
        ...resolveOIMComputedDerivationOptions(options),
        createSources: options.createSources,
        derive: options.derive,
    });
}
