import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMComputedDerivationOptions } from './TOIMComputedDerivationOptions';

export type TOIMComputedServiceOptions<TKey extends NonNullable<unknown>, TValue, TComputedStore> =
    TOIMComputedDerivationOptions<TValue, TOIMComputedSlot<TValue, TKey>> & {
        computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore>;
    };
