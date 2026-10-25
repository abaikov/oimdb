import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';

export type TOIMComputedSources = {
    readonly sourceSlots: readonly TOIMSlot[];
    readonly sourceComputeds: readonly TOIMComputedContentSlot[];
};
