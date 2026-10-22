import type { TOIMSlot } from '../types/TOIMSlot';

export function oimGetReleaseDueAfterIdleMs(slot: TOIMSlot): number {
    return slot.releaseDueAfterIdleMs;
}
