import { OIMEventQueueScheduler } from '../abstract/OIMEventQueueScheduler';
import { TOIMEventQueueOptions } from '../types/TOIMEventQueueOptions';
import { EOIMEventQueueSchedulerEventType } from '../enum/EOIMEventQueueSchedulerEventType';

/**
 * Event queue that can optionally integrate with a scheduler for automatic flushing.
 */
export class OIMEventQueue {
    protected queue: (() => void)[] = [];
    protected readonly scheduler?: OIMEventQueueScheduler;
    protected flushBound?: () => void;

    constructor(options: TOIMEventQueueOptions = {}) {
        this.scheduler = options.scheduler;

        if (this.scheduler) {
            // Bind flush method once to avoid creating new functions on each subscription
            this.flushBound = () => this.flush();
            this.scheduler.on(
                EOIMEventQueueSchedulerEventType.FLUSH,
                this.flushBound
            );
        }
    }

    /**
     * Add a function to the queue. If scheduler is configured and autoSchedule is enabled,
     * automatically schedules a flush operation.
     */
    public enqueue(fn: () => void): void {
        this.queue.push(fn);

        if (this.scheduler && this.queue.length === 1) {
            // Only schedule when queue transitions from empty to non-empty
            this.scheduler.schedule();
        }
    }

    /**
     * Execute all queued functions and clear the queue.
     * This method is safe to call multiple times and handles reentrancy.
     */
    public flush(): void {
        if (this.queue.length === 0) return;

        // Take snapshot of current queue and clear it immediately to handle reentrancy
        const currentQueue = this.queue.slice();
        this.queue.length = 0;

        for (let i = 0; i < currentQueue.length; i++) {
            currentQueue[i]();
        }
    }

    /**
     * Get the current number of queued functions.
     */
    public get length(): number {
        return this.queue.length;
    }

    /**
     * Check if the queue is empty.
     */
    public get isEmpty(): boolean {
        return this.queue.length === 0;
    }

    /**
     * Clear the queue without executing functions and cancel any scheduled flush.
     */
    public clear(): void {
        this.queue.length = 0;
        this.scheduler?.cancel();
    }

    /**
     * Clean up scheduler subscription when queue is no longer needed.
     */
    public destroy(): void {
        if (this.scheduler && this.flushBound) {
            this.scheduler.off(
                EOIMEventQueueSchedulerEventType.FLUSH,
                this.flushBound
            );
        }
        this.clear();
    }
}
