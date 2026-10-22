import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import { oimMergeRootSlots } from './oimMergeRootSlots';

export function oimGetAllRootSlots(computedSlot: TOIMComputedSlot): readonly TOIMSlot[] {
    const allRootSlots = computedSlot.allRootSlots;
    if (allRootSlots !== undefined) return allRootSlots;
    const mergedRootSlots = oimMergeRootSlots(computedSlot.sourceSlots, computedSlot.sourceComputeds);
    (computedSlot as TOIMSlotEditable<TOIMComputedSlot>).allRootSlots = mergedRootSlots;
    return mergedRootSlots;
}
