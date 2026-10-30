import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';
import { oimMergeRootSlots } from './oimMergeRootSlots';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export function oimGetAllRootSlots(computedSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>): readonly TOIMSlot[] {
    const allRootSlots = computedSlot.allRootSlots;
    if (allRootSlots !== undefined) return allRootSlots;
    const mergedRootSlots = oimMergeRootSlots(computedSlot.sourceSlots, computedSlot.sourceComputeds);
    (computedSlot as TOIMEditable<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>>).allRootSlots = mergedRootSlots;
    return mergedRootSlots;
}
