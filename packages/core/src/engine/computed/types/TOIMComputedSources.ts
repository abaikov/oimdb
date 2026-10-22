import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMComputedSlot } from './TOIMComputedSlot';

export type TOIMComputedSources = {
    readonly sourceSlots: readonly TOIMSlot[];
    readonly sourceComputeds: readonly TOIMComputedSlot[];
};
