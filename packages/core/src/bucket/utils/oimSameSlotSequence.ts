import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export function oimSameSlotSequence(prev: readonly TOIMSlot[], next: readonly TOIMSlot[]): boolean {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i]) return false;
    return true;
}