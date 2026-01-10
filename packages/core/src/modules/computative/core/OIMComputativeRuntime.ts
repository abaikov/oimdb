import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { EOIMEventQueueEventType } from '../../../enum/EOIMEventQueueEventType';

/**
 * Computative runtime that schedules derived computations by levels and runs them
 * on `queue.flush()` boundary (AFTER_FLUSH).
 */
export class OIMComputativeRuntime {
    private isFlushScheduled = false;
    private isFlushing = false;
    private minLevel = Infinity;
    private maxLevel = -Infinity;
    private readonly dirtyByLevel = new Map<number, Set<() => void>>();
    private readonly afterFlushTasks = new Set<() => void>();

    constructor(public readonly queue: OIMEventQueue) {
        this.queue.emitter.on(EOIMEventQueueEventType.AFTER_FLUSH, () => {
            // If nothing was scheduled, do nothing.
            if (!this.isFlushScheduled) return;
            this.flush();
        });
    }

    /**
     * Schedule a one-shot task to run on the next `queue.flush()` (AFTER_FLUSH),
     * ordered by `level` ascending.
     */
    public schedule(task: () => void, level: number = 0): () => void {
        let isActive = true;

        const wrapped = () => {
            if (!isActive) return;
            task();
        };

        let bucket = this.dirtyByLevel.get(level);
        if (!bucket) {
            bucket = new Set();
            this.dirtyByLevel.set(level, bucket);
        }
        bucket.add(wrapped);

        if (level < this.minLevel) this.minLevel = level;
        if (level > this.maxLevel) this.maxLevel = level;
        if (!this.isFlushing) this.isFlushScheduled = true;

        return () => {
            if (!isActive) return;
            isActive = false;
            bucket!.delete(wrapped);
        };
    }

    /**
     * Run once at the start of the next runtime flush (i.e. after queue.flush()).
     * Useful for resubscribing dependencies exactly once per source flush.
     */
    public scheduleAfterFlush(task: () => void): () => void {
        let isActive = true;
        const wrapped = () => {
            if (!isActive) return;
            task();
        };
        this.afterFlushTasks.add(wrapped);
        if (!this.isFlushing) this.isFlushScheduled = true;
        return () => {
            if (!isActive) return;
            isActive = false;
            this.afterFlushTasks.delete(wrapped);
        };
    }

    private flush(): void {
        this.isFlushScheduled = false;
        if (this.dirtyByLevel.size === 0 && this.afterFlushTasks.size === 0)
            return;

        this.isFlushing = true;
        try {
            if (this.afterFlushTasks.size > 0) {
                const snapshot = Array.from(this.afterFlushTasks);
                this.afterFlushTasks.clear();
                for (let i = 0; i < snapshot.length; i++) snapshot[i]();
            }

            if (this.dirtyByLevel.size === 0) return;

            let level = this.minLevel;
            let max = this.maxLevel;

            while (level <= max) {
                // Drain this level completely (tasks may schedule more tasks at the same level).
                // We intentionally don't try to detect infinite loops here.
                for (;;) {
                    const bucket = this.dirtyByLevel.get(level);
                    if (!bucket || bucket.size === 0) break;

                    this.dirtyByLevel.delete(level);
                    const snapshot = Array.from(bucket);
                    for (let i = 0; i < snapshot.length; i++) snapshot[i]();
                }

                // If flush extended max level, pick it up.
                if (this.maxLevel > max) max = this.maxLevel;
                level++;
            }
        } finally {
            this.isFlushing = false;
            if (this.dirtyByLevel.size === 0) {
                this.minLevel = Infinity;
                this.maxLevel = -Infinity;
            } else {
                // Remaining work will run on the next queue.flush().
                let nextMin = Infinity;
                let nextMax = -Infinity;
                this.dirtyByLevel.forEach((_bucket, lvl) => {
                    if (lvl < nextMin) nextMin = lvl;
                    if (lvl > nextMax) nextMax = lvl;
                });
                this.minLevel = nextMin;
                this.maxLevel = nextMax;
                this.isFlushScheduled = true;
            }
        }
    }
}
