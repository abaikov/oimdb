import type { TOIMFlushSchedulerSlot } from '../types/TOIMFlushSchedulerSlot';

export interface IOIMFlushSchedulerListener<TFlushSchedulerSlot extends TOIMFlushSchedulerSlot> {
    onSchedulerTimerFired(flushSchedulerSlot: TFlushSchedulerSlot): void;
}
