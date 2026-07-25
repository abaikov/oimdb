import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { EOIMEventQueueEventType } from '../../../enums/EOIMEventQueueEventType';
import { IOIMEffectDependency } from '../../effect/interfaces/IOIMEffectDependency';
import { OIMEffectDependencyComputed } from '../../effect/core/OIMEffectDependencyComputed';

/**
 * Computative runtime that schedules derived computations by levels and runs them
 * on `queue.flush()` boundary (AFTER_FLUSH).
 *
 * Buckets are held in an array indexed by topological level (levels are dense
 * small non-negative ints), not a `Map` — so the hot schedule/drain path indexes
 * directly with no hashing. The per-level `Set`s are POOLED: kept in their slot
 * and `.clear()`ed between flushes rather than re-allocated.
 */
export class OIMComputeRuntime {
    private isFlushScheduled = false;
    private isFlushing = false;
    // Active level range (min > max means nothing pending).
    private minLevel = Infinity;
    private maxLevel = -Infinity;
    private readonly dirtyByLevel: Array<Set<() => void>> = [];
    private readonly afterFlushTasks = new Set<() => void>();
    // Topological depth per computed node — the engine is the ONLY owner of
    // levels; nodes never expose their own. A node's dependents look up its depth
    // here (by the computed reference their dependency wraps). Written once at
    // construction, never on the hot flush path.
    private readonly levelByComputed = new WeakMap<object, number>();
    private readonly unsubscribeFromQueue: () => void;
    private _isDestroyed = false;

    constructor(public readonly queue: OIMEventQueue) {
        this.unsubscribeFromQueue = this.queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            () => {
                // If nothing was scheduled, do nothing.
                if (!this.isFlushScheduled) return;
                this.flush();
            }
        );
    }

    /**
     * Whether {@link destroy} has run. A destroyed runtime is detached from its
     * queue and must not be reused — `getOIMComputeRuntime` reads this to hand
     * out a fresh runtime instead of a dead one.
     */
    public get isDestroyed(): boolean {
        return this._isDestroyed;
    }

    /**
     * Detach from the queue and drop everything pending.
     *
     * Without this the AFTER_FLUSH subscription lives as long as the queue does,
     * even once every computed / effect on this runtime is gone — harmless (the
     * handler early-returns) but impossible to unwind. Destroying does NOT
     * destroy the nodes scheduled on it; destroy them first, then the runtime.
     * Idempotent.
     */
    public destroy(): void {
        if (this._isDestroyed) return;
        this._isDestroyed = true;
        this.unsubscribeFromQueue();

        for (let i = 0; i < this.dirtyByLevel.length; i++) {
            this.dirtyByLevel[i]?.clear();
        }
        this.afterFlushTasks.clear();
        this.minLevel = Infinity;
        this.maxLevel = -Infinity;
        this.isFlushScheduled = false;
    }

    /**
     * Topological depth for a node with these dependencies: one above the deepest
     * computed dependency (source-only → 0). The engine owns this — callers pass
     * their dependencies and get back a level, they never compute it themselves.
     */
    public computeLevel(deps: readonly IOIMEffectDependency[]): number {
        let max = -1;
        for (const dep of deps) {
            if (dep instanceof OIMEffectDependencyComputed) {
                const depLevel = this.levelByComputed.get(dep.source) ?? 0;
                if (depLevel > max) max = depLevel;
            }
        }
        return max + 1;
    }

    /** Record a computed's depth so its dependents can look it up. */
    public registerLevel(computed: object, level: number): void {
        this.levelByComputed.set(computed, level);
    }

    /** The recorded topological depth of a computed (0 if unknown). Introspection. */
    public getLevel(computed: object): number {
        return this.levelByComputed.get(computed) ?? 0;
    }

    /**
     * Schedule a one-shot task to run on the next `queue.flush()` (AFTER_FLUSH),
     * ordered by `level` ascending.
     */
    public schedule(task: () => void, level = 0): () => void {
        let isActive = true;

        const wrapped = () => {
            if (!isActive) return;
            task();
        };

        let bucket = this.dirtyByLevel[level];
        if (bucket === undefined) {
            bucket = new Set();
            this.dirtyByLevel[level] = bucket;
        }
        bucket.add(wrapped);

        if (level < this.minLevel) this.minLevel = level;
        if (level > this.maxLevel) this.maxLevel = level;
        if (!this.isFlushing) this.isFlushScheduled = true;

        return () => {
            if (!isActive) return;
            isActive = false;
            bucket.delete(wrapped);
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
        if (this.minLevel > this.maxLevel && this.afterFlushTasks.size === 0)
            return;

        this.isFlushing = true;
        try {
            if (this.afterFlushTasks.size > 0) {
                const snapshot = Array.from(this.afterFlushTasks);
                this.afterFlushTasks.clear();
                for (let i = 0; i < snapshot.length; i++) snapshot[i]();
            }

            if (this.minLevel > this.maxLevel) return;

            let level = this.minLevel;
            let max = this.maxLevel;

            while (level <= max) {
                // Drain this level completely (tasks may schedule more tasks at
                // the same level). No infinite-loop detection by design.
                for (;;) {
                    const bucket = this.dirtyByLevel[level];
                    if (bucket === undefined || bucket.size === 0) break;

                    const snapshot = Array.from(bucket);
                    // Clear BEFORE running so tasks scheduled during the drain
                    // repopulate the same (pooled) Set for the next iteration.
                    bucket.clear();
                    for (let i = 0; i < snapshot.length; i++) snapshot[i]();
                }

                // If flush extended max level, pick it up.
                if (this.maxLevel > max) max = this.maxLevel;
                level++;
            }
        } finally {
            this.isFlushing = false;
            // Recompute the pending range over the pooled buckets. Normally
            // everything drained → nothing pending; if a task threw mid-drain,
            // whatever is left runs on the next queue.flush().
            this.recomputePendingRange();
        }
    }

    private recomputePendingRange(): void {
        let nextMin = Infinity;
        let nextMax = -Infinity;
        const buckets = this.dirtyByLevel;
        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];
            if (bucket !== undefined && bucket.size > 0) {
                if (i < nextMin) nextMin = i;
                if (i > nextMax) nextMax = i;
            }
        }
        this.minLevel = nextMin;
        this.maxLevel = nextMax;
        if (nextMin <= nextMax) this.isFlushScheduled = true;
    }
}
