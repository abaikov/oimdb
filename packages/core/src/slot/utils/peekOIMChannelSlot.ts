import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';

export function peekOIMChannelSlot(slot: TOIMSlot): TOIMChannelSlot {
    return slot.storeSlot.channelSlot;
}
