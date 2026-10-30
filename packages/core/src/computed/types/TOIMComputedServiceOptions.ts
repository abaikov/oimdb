import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedSlot } from './TOIMComputedSlot';
import type { TOIMComputedDerivationOptions } from './TOIMComputedDerivationOptions';

export type TOIMComputedServiceOptions<TKey extends NonNullable<unknown>, TValue, TComputedStore> =
    TOIMComputedDerivationOptions<TValue, TOIMComputedSlot<TValue, TKey>> & {
        computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore>;
    };
