import type { OIMComputedValueService } from '../OIMComputedValueService';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { TOIMComputedSources } from './TOIMComputedSources';

export type TOIMSlotContentComputedServiceOptions<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue>> = {
    computedValueService: OIMComputedValueService<TValue, TComputedSlot>;
    createSources?: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined;
    initialValue?: TValue | undefined;
};
