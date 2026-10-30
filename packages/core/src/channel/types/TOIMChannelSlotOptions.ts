import type { TOIMCollectorSlot } from '../../collector/types/TOIMCollectorSlot';
import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';
import type { TOIMTimer } from '../../schedule/types/TOIMTimer';
import type { TOIMChannelClock } from './TOIMChannelClock';

export type TOIMChannelSlotOptions = {
    clock: TOIMChannelClock;
    collectorSlot: TOIMCollectorSlot;
    errorPolicy: IOIMErrorPolicy;
    timer?: TOIMTimer | undefined;
    onBeforeFlush?: (() => void) | undefined;
};
