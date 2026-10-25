import type { TOIMDisposer } from './types/TOIMDisposer';
import type { TOIMFlushSchedulerSlot } from './types/TOIMFlushSchedulerSlot';
import type { IOIMFlushSchedulerListener } from './interfaces/IOIMFlushSchedulerListener';

export class OIMFlushSchedulerService {
    public static readonly INSTANCE = new OIMFlushSchedulerService();

    public isScheduled(flushSchedulerSlot: TOIMFlushSchedulerSlot): boolean {
        return flushSchedulerSlot.scheduledCallback !== undefined;
    }

    public schedule<TFlushSchedulerSlot extends TOIMFlushSchedulerSlot>(
        flushSchedulerSlot: TFlushSchedulerSlot, delayMs: number, flushSchedulerListener: IOIMFlushSchedulerListener<TFlushSchedulerSlot>,
    ): void {
        if (flushSchedulerSlot.scheduledCallback !== undefined) return;
        const timer = flushSchedulerSlot.timer;
        if (timer === undefined) return;
        const scheduledCallback = (): void => {
            if (flushSchedulerSlot.scheduledCallback !== scheduledCallback) return;
            flushSchedulerSlot.scheduledCallback = undefined;
            flushSchedulerSlot.timerDisposer = undefined;
            flushSchedulerListener.onSchedulerTimerFired(flushSchedulerSlot);
        };
        flushSchedulerSlot.scheduledCallback = scheduledCallback;
        let timerDisposer: TOIMDisposer;
        try {
            timerDisposer = timer(scheduledCallback, delayMs);
        } catch (failure) {
            if (flushSchedulerSlot.scheduledCallback === scheduledCallback) flushSchedulerSlot.scheduledCallback = undefined;
            throw failure;
        }
        if (flushSchedulerSlot.scheduledCallback === scheduledCallback) flushSchedulerSlot.timerDisposer = timerDisposer;
    }

    public cancelSchedule(flushSchedulerSlot: TOIMFlushSchedulerSlot): void {
        flushSchedulerSlot.scheduledCallback = undefined;
        const timerDisposer = flushSchedulerSlot.timerDisposer;
        flushSchedulerSlot.timerDisposer = undefined;
        timerDisposer?.();
    }
}
