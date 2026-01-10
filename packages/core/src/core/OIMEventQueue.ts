import { OIMEventQueueScheduler } from '../abstract/OIMEventQueueScheduler';
import { TOIMEventQueueOptions } from '../type/TOIMEventQueueOptions';
import { EOIMEventQueueSchedulerEventType } from '../enum/EOIMEventQueueSchedulerEventType';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMEventQueueEventType } from '../enum/EOIMEventQueueEventType';

/**
 * Event queue that can optionally integrate with a scheduler for automatic flushing.
 */
export class OIMEventQueue {
    public readonly emitter = new OIMEventEmitter<
        Record<EOIMEventQueueEventType, void>
    >();
    protected tasks = new Set<() => void>();
    protected readonly scheduler?: OIMEventQueueScheduler;
    protected flushBound?: () => void;
    protected isFlushing = false;

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
     * Enqueue a one-shot task to be executed on the next flush.
     * Returns a dequeue function that can be called to cancel the task before it runs.
     */
    public enqueue(fn: () => void): () => void {
        let isActive = true;
        const task = () => {
            if (!isActive) return;
            fn();
        };
        this.tasks.add(task);
        this.ensureScheduled();

        return () => {
            if (!isActive) return;
            isActive = false;
            this.tasks.delete(task);
        };
    }

    public get isInFlush(): boolean {
        return this.isFlushing;
    }

    /**
     * Dequeue (cancel) a previously enqueued task by its dequeue function.
     */
    public dequeue(dequeueFn: () => void): void {
        dequeueFn();
    }

    /**
     * Execute all pending tasks.
     *
     * This flush drains until the queue is empty. If tasks enqueue more tasks, they will be
     * executed within the same flush.
     */
    public flush(): void {
        // If a flush was scheduled, manual flush supersedes it.
        this.scheduler?.cancel();

        this.isFlushing = true;
        this.emitter.emit(EOIMEventQueueEventType.BEFORE_FLUSH, undefined);

        const snapshot = Array.from(this.tasks);
        this.tasks.clear();

        for (let i = 0; i < snapshot.length; i++) {
            snapshot[i]();
        }

        this.isFlushing = false;
        this.emitter.emit(EOIMEventQueueEventType.AFTER_FLUSH, undefined);
    }

    /**
     * Get the current number of queued functions.
     */
    public get length(): number {
        return this.tasks.size;
    }

    /**
     * Check if the queue is empty.
     */
    public get isEmpty(): boolean {
        return this.tasks.size === 0;
    }

    /**
     * Clear the queue without executing functions and cancel any scheduled flush.
     */
    public clear(): void {
        this.tasks.clear();
        this.scheduler?.cancel();
    }

    protected ensureScheduled(): void {
        if (!this.scheduler) return;
        if (this.isFlushing) return;
        if (this.tasks.size === 1) {
            // Only schedule when transitioning from empty to non-empty.
            this.scheduler.schedule();
        }
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
