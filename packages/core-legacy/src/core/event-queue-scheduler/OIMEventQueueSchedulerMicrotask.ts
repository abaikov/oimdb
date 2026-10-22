import { OIMEventQueueScheduler } from '../../abstract/OIMEventQueueScheduler';

/**
 * Microtask-based scheduler that executes flushes in the next microtask.
 * Ideal for batching synchronous operations while maintaining immediate execution.
 */
export class OIMEventQueueSchedulerMicrotask extends OIMEventQueueScheduler {
    protected scheduled = false;

    schedule(): void {
        if (this.scheduled) return;
        this.scheduled = true;
        Promise.resolve().then(() => {
            if (!this.scheduled) return;
            this.scheduled = false;
            this.flush();
        });
    }

    cancel(): void {
        if (!this.scheduled) return;
        this.scheduled = false;
    }
}
