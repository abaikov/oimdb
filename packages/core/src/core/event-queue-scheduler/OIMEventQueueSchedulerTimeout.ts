import { OIMEventQueueScheduler } from '../../abstract/OIMEventQueueScheduler';

/**
 * Timeout-based scheduler that executes flushes after a specified delay.
 * Useful for debouncing operations or creating custom timing strategies.
 */
export class OIMEventQueueSchedulerTimeout extends OIMEventQueueScheduler {
    protected timeoutId?: number;
    protected readonly delay: number;

    /**
     * @param delay - Delay in milliseconds before executing the flush (default: 0)
     */
    constructor(delay: number = 0) {
        super();
        this.delay = Math.max(0, delay);
    }

    schedule(): void {
        if (this.timeoutId !== undefined) return;

        this.timeoutId = setTimeout(() => {
            this.timeoutId = undefined;
            this.flush();
        }, this.delay) as unknown as number;
    }

    cancel(): void {
        if (this.timeoutId === undefined) return;

        clearTimeout(this.timeoutId);
        this.timeoutId = undefined;
    }
}
