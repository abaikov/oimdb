import type { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import type { TOIMEffectOptions } from '../types/TOIMEffectOptions';
import type { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';
import { OIMEffectDependencyComputed } from './OIMEffectDependencyComputed';

export class OIMEffect {
    private readonly runtime: OIMComputeRuntime;
    private readonly onUpdate?: () => void;
    private readonly run: () => void;
    private readonly deps: readonly IOIMEffectDependency[];

    /**
     * Topological depth, owned by the runtime — one above the deepest computed
     * dependency (source-only effects are `0`). Passed to `runtime.schedule` so
     * this node runs only after everything it depends on. Internal: nodes never
     * expose their own level.
     */
    private readonly level: number;

    private readonly sourceDeps: Array<IOIMEffectDependency> = [];
    private readonly computedDeps: Array<IOIMEffectDependency> = [];
    private sourceUnsubscribers: Array<() => void> = [];
    private computedUnsubscribers: Array<() => void> = [];
    /**
     * The flush this effect last reported in. Comparing it against the queue's
     * counter is the whole muting mechanism: it says "already reported this
     * frame" without scheduling anything.
     *
     * The previous version enqueued an unmute task on every invalidation — a
     * closure, a `Set` insert, and a pass over `afterFlushTasks` in the runtime,
     * all to flip one boolean at the start of the next flush. Profiled at ~7% of
     * the write path for bookkeeping a comparison answers for free.
     */
    private reportedInFlush = -1;
    private active = false;
    private isScheduled = false;
    private dequeueScheduled?: () => void;

    private readonly runTask = () => {
        this.isScheduled = false;
        this.dequeueScheduled = undefined;

        this.runOnce();
    };

    constructor(
        runtime: OIMComputeRuntime,
        opts: TOIMEffectOptions,
        // A computed passes its already-computed level; standalone effects let
        // the runtime derive it from their dependencies.
        level?: number
    ) {
        this.runtime = runtime;
        this.onUpdate = opts.onUpdate;
        this.run = opts.run;
        this.deps = opts.deps ?? [];

        for (const dep of this.deps) {
            if (dep instanceof OIMEffectDependencyComputed) {
                this.computedDeps.push(dep);
            } else {
                this.sourceDeps.push(dep);
            }
        }
        this.level = level ?? this.runtime.computeLevel(this.deps);

        if (opts.startActive !== false) this.activate();
    }

    /**
     * Whether this effect is currently listening. An inactive effect keeps its
     * dependency list and its identity but holds no subscriptions, so it costs
     * nothing and cannot fire.
     */
    public get isActive(): boolean {
        return this.active;
    }

    /**
     * Start listening. Idempotent.
     *
     * Exists so a consumer whose lifetime is shorter than the effect's — a
     * selector with no watchers, an effect bound to a mounted component — can
     * stop paying for subscriptions without destroying and rebuilding the node.
     */
    public activate(): void {
        if (this.active) return;
        this.active = true;
        this.subscribeToDeps();
    }

    /**
     * Stop listening, keeping the effect reusable. Any run already scheduled for
     * this flush is cancelled: an inactive effect must not fire.
     */
    public deactivate(): void {
        if (!this.active) return;
        this.active = false;
        if (this.dequeueScheduled) {
            this.dequeueScheduled();
            this.dequeueScheduled = undefined;
        }
        this.isScheduled = false;
        this.reportedInFlush = -1;
        this.unsubscribeFromAllDeps();
    }

    public destroy(): void {
        this.active = false;
        if (this.dequeueScheduled) {
            this.dequeueScheduled();
            this.dequeueScheduled = undefined;
        }

        this.unsubscribeFromAllDeps();

        this.reportedInFlush = -1;
    }

    private onSourceInvalidate = () => {
        // Already reported this frame — the earlier notification scheduled the
        // run, and every source that could report is folded into it.
        const flush = this.runtime.queue.flushCount;
        if (this.reportedInFlush === flush) return;
        this.reportedInFlush = flush;

        this.onUpdate?.();

        if (this.isScheduled) return;
        this.isScheduled = true;
        this.dequeueScheduled = this.runtime.schedule(this.runTask, this.level);
    };

    private onComputedInvalidate = () => {
        this.onUpdate?.();
        if (this.isScheduled) return;
        this.isScheduled = true;
        this.dequeueScheduled = this.runtime.schedule(this.runTask, this.level);
    };

    private runOnce(): void {
        this.run();
    }

    private subscribeToDeps(): void {
        if (
            this.sourceUnsubscribers.length > 0 ||
            this.computedUnsubscribers.length > 0
        )
            return;
        for (const dep of this.sourceDeps) {
            this.sourceUnsubscribers.push(
                dep.subscribe(this.onSourceInvalidate)
            );
        }
        for (const dep of this.computedDeps) {
            this.computedUnsubscribers.push(
                dep.subscribe(this.onComputedInvalidate)
            );
        }
    }

    private unsubscribeFromSourceDeps(): void {
        if (this.sourceUnsubscribers.length === 0) return;
        for (const unsubscribe of this.sourceUnsubscribers) unsubscribe();
        this.sourceUnsubscribers = [];
    }

    private unsubscribeFromAllDeps(): void {
        this.unsubscribeFromSourceDeps();
        if (this.computedUnsubscribers.length === 0) return;
        for (const unsubscribe of this.computedUnsubscribers) unsubscribe();
        this.computedUnsubscribers = [];
    }

}
