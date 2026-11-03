import type { TOIMSlot } from '../types/TOIMSlot';

export function peekOIMReleaseDueAfterWriteMs(slot: TOIMSlot): number {
    return slot.releaseDueAfterWriteMs;
}
