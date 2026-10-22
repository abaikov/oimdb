import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../channel/OIMChannelQueue';

export type TOIMUnusedSlotCollectorSlot = {
    readonly unusedSlotChannelQueue: OIMChannelQueue<TOIMSlot>;
    openDepth: number;
    isFlushing: boolean;
};
