import type { TOIMComputedContentSlot } from '../../../engine/computed/types/TOIMComputedContentSlot';
import type { TOIMComputedSources } from '../../../engine/computed/types/TOIMComputedSources';
import type { TOIMComputedStoreSlot } from '../../../engine/computed/types/TOIMComputedStoreSlot';
import type { TOIMSlotEditable } from '../../../engine/slot/types/TOIMSlotEditable';

export function oimAttachComputedDerivation<TStore, TValue, TComputedSlot extends TOIMComputedContentSlot<TValue>>(
    computedStoreSlot: TOIMComputedStoreSlot<TStore, TValue, TComputedSlot>,
    hasServiceDerive: boolean, hasServiceCreateSources: boolean,
    derive: ((computedSlot: TComputedSlot) => TValue) | undefined,
    createSources: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined,
): TOIMComputedStoreSlot<TStore, TValue, TComputedSlot> {
    if ((derive === undefined && !hasServiceDerive) || (createSources === undefined && !hasServiceCreateSources)) {
        throw new Error(
            'A computed store slot needs a derive and a createSources, from the store slot or from the service options. '
            + 'Pass the missing one when creating the store slot or to the service.',
        );
    }
    const computedStoreSlotEditable = computedStoreSlot as TOIMSlotEditable<TOIMComputedStoreSlot<TStore, TValue, TComputedSlot>>;
    computedStoreSlotEditable.derive = derive;
    computedStoreSlotEditable.createSources = createSources;
    return computedStoreSlot;
}
