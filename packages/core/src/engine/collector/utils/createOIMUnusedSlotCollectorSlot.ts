import type { TOIMUnusedSlotCollectorSlot } from '../types/TOIMUnusedSlotCollectorSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { OIMChannelQueue } from '../../channel/OIMChannelQueue';

export function createOIMUnusedSlotCollectorSlot(): TOIMUnusedSlotCollectorSlot {
    return { unusedSlotChannelQueue: new OIMChannelQueue<TOIMSlot>(), openDepth: 0, isFlushing: false };
}
