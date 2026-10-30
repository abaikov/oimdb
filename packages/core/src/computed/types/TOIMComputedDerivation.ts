import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMComputedDerivation = {
    readonly sourceSlots: readonly TOIMSlot[];
    readonly sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[];
    ranAtRevision: number;
    ranAtEpoch: number;
};
