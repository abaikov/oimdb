import type { TOIMSlot } from '../types/TOIMSlot';

export function oimGetReleaseDueAfterWriteMs(slot: TOIMSlot): number {
    return slot.releaseDueAfterWriteMs;
}
