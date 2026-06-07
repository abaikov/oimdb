import { OIMEventQueueScheduler } from '../abstract/OIMEventQueueScheduler';
import { TOIMEventQueueOptions } from '../types/TOIMEventQueueOptions';
import { EOIMEventQueueSchedulerEventType } from '../enums/EOIMEventQueueSchedulerEventType';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMEventQueueEventType } from '../enums/EOIMEventQueueEventType';

/**
 * Event queue that can optionally integrate with a scheduler for automatic flushing.
 */
export class OIMEventQueue {
    public readonly emitter = new OIMEventEmitter<
        Record<EOIMEventQueueEventType, void>
    >();
    protected tasks = new Set<() => void>();
    // Reused buffer swapped in during flush so the pending set is never copied
    // (no per-flush array snapshot) and new enqueues land in a fresh set.
    protected tasksSpare = new Set<() => void>();
    // The set currently being drained, so cancel() can also remove a task
    // mid-flush (a Set's for..of skips entries deleted before they're reached).
    protected flushing?: Set<() => void>;
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
     * Enqueue a one-shot task to run on the next flush. The function is stored
     * directly (no wrapper, no returned closure) and cancelled via {@link cancel}
     * by passing the same reference. Enqueuing the same reference twice is
     * idempotent — it is Set-deduped and runs once per flush.
     */
    public enqueue(fn: () => void): void {
        this.tasks.add(fn);
        this.ensureScheduled();
    }

    /** Cancel a previously enqueued task by its reference; safe to call mid-flush. */
    public cancel(fn: () => void): void {
        this.tasks.delete(fn);
        this.flushing?.delete(fn);
    }

    public get isInFlush(): boolean {
        return this.isFlushing;
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

        // Swap the pending set out for an empty spare: tasks enqueued during the
        // drain land in the fresh set (run next flush), exactly as before — but
        // without copying the pending set into a snapshot array.
        const flushing = this.tasks;
        this.tasks = this.tasksSpare;
        this.flushing = flushing;

        for (const task of flushing) task();

        flushing.clear();
        this.tasksSpare = flushing;
        this.flushing = undefined;

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
