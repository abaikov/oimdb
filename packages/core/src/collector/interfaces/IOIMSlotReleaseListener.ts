import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export interface IOIMSlotReleaseListener {
    onSlotReleased(slot: TOIMSlot): void;
}
