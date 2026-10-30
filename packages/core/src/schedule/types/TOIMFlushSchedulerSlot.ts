import type { TOIMDisposer } from './TOIMDisposer';
import type { TOIMTimer } from './TOIMTimer';

export type TOIMFlushSchedulerSlot = {
    readonly timer: TOIMTimer | undefined;
    scheduledCallback: (() => void) | undefined;
    timerDisposer: TOIMDisposer | undefined;
};
