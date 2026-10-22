import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';

export function oimGetChannelSlot(slot: TOIMSlot): TOIMChannelSlot {
    return (slot.storeSlot as TOIMStoreSlot).channelSlot;
}
