import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import { oimMergeRootSlots } from './oimMergeRootSlots';

export function oimGetAllRootSlots(computedSlot: TOIMComputedContentSlot): readonly TOIMSlot[] {
    const allRootSlots = computedSlot.allRootSlots;
    if (allRootSlots !== undefined) return allRootSlots;
    const mergedRootSlots = oimMergeRootSlots(computedSlot.sourceSlots, computedSlot.sourceComputeds);
    (computedSlot as TOIMSlotEditable<TOIMComputedContentSlot>).allRootSlots = mergedRootSlots;
    return mergedRootSlots;
}
