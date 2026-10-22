import type { TOIMDisposer } from './types/TOIMDisposer';
import type { TOIMFlushSchedulerSlot } from './types/TOIMFlushSchedulerSlot';

export abstract class OIMFlushSchedulerService<TFlushSchedulerSlot extends TOIMFlushSchedulerSlot> {
    public abstract flush(flushSchedulerSlot: TFlushSchedulerSlot): void;

    protected onSchedulerTimerFired(flushSchedulerSlot: TFlushSchedulerSlot): void { this.flush(flushSchedulerSlot); }

    protected isScheduled(flushSchedulerSlot: TFlushSchedulerSlot): boolean {
        return flushSchedulerSlot.scheduledCallback !== undefined;
    }

    protected schedule(flushSchedulerSlot: TFlushSchedulerSlot, delayMs: number): void {
        if (flushSchedulerSlot.scheduledCallback !== undefined) return;
        const timer = flushSchedulerSlot.timer;
        if (timer === undefined) return;
        const scheduledCallback = (): void => {
            if (flushSchedulerSlot.scheduledCallback !== scheduledCallback) return;
            flushSchedulerSlot.scheduledCallback = undefined;
            flushSchedulerSlot.timerDisposer = undefined;
            this.onSchedulerTimerFired(flushSchedulerSlot);
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

    protected cancelSchedule(flushSchedulerSlot: TFlushSchedulerSlot): void {
        flushSchedulerSlot.scheduledCallback = undefined;
        const timerDisposer = flushSchedulerSlot.timerDisposer;
        flushSchedulerSlot.timerDisposer = undefined;
        timerDisposer?.();
    }
}
