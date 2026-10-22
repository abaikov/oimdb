import type { OIMComputedValueService } from '../OIMComputedValueService';
import type { TOIMComputedSources } from './TOIMComputedSources';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';

export type TOIMSlotContentComputedStrategyOptions<TKey, TValue> = {
    computedValueService: OIMComputedValueService<TKey, TValue>;
    createSources?: ((key: TKey, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>) | undefined;
    initialValue?: TValue | undefined;
};
