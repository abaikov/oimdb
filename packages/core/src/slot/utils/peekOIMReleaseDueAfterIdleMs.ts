import type { TOIMSlot } from '../types/TOIMSlot';

export function peekOIMReleaseDueAfterIdleMs(slot: TOIMSlot): number {
    return slot.releaseDueAfterIdleMs;
}
