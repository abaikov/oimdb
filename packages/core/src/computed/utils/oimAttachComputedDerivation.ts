import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { TOIMComputedSources } from '../types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from '../types/TOIMComputedStoreSlot';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimAttachComputedDerivation<TStore, TValue, TComputedSlot extends TOIMComputedContentSlot<TValue>, TSlotService>(
    computedStoreSlot: TOIMComputedStoreSlot<TStore, TValue, TComputedSlot, TSlotService>,
    hasServiceDerive: boolean, hasServiceCreateSources: boolean,
    derive: ((computedSlot: TComputedSlot) => TValue) | undefined,
    createSources: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined,
): TOIMComputedStoreSlot<TStore, TValue, TComputedSlot, TSlotService> {
    if ((derive === undefined && !hasServiceDerive) || (createSources === undefined && !hasServiceCreateSources)) {
        throw new Error(
            'A computed store slot needs a derive and a createSources, from the store slot or from the service options. '
            + 'Pass the missing one when creating the store slot or to the service.',
        );
    }
    const editableComputedStoreSlot = computedStoreSlot as TOIMEditable<TOIMComputedStoreSlot<TStore, TValue, TComputedSlot, TSlotService>>;
    editableComputedStoreSlot.derive = derive;
    editableComputedStoreSlot.createSources = createSources;
    return computedStoreSlot;
}
