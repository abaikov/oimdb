import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { TOIMEffectOptions } from '../types/TOIMEffectOptions';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';
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
    private dequeueResubscribe?: () => void;
    private isResubscribeEnqueued = false;
    private isTemporarilyUnsubscribedForFlush = false;
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

        this.subscribeToDeps();
    }

    public destroy(): void {
        if (this.dequeueScheduled) {
            this.dequeueScheduled();
            this.dequeueScheduled = undefined;
        }

        this.unsubscribeFromAllDeps();

        if (this.dequeueResubscribe) {
            this.dequeueResubscribe();
            this.dequeueResubscribe = undefined;
        }
        this.isResubscribeEnqueued = false;
        this.isTemporarilyUnsubscribedForFlush = false;
    }

    private onSourceInvalidate = () => {
        this.onUpdate?.();

        if (!this.isTemporarilyUnsubscribedForFlush) {
            this.isTemporarilyUnsubscribedForFlush = true;
            this.unsubscribeFromSourceDeps();
            this.ensureResubscribeAfterFlush();
        }

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

    private ensureResubscribeAfterFlush(): void {
        if (this.isResubscribeEnqueued) return;
        this.isResubscribeEnqueued = true;
        this.dequeueResubscribe = this.runtime.scheduleAfterFlush(
            this.onAfterFlush
        );
    }

    private readonly onAfterFlush = () => {
        if (!this.isResubscribeEnqueued) return;
        this.isResubscribeEnqueued = false;
        this.dequeueResubscribe = undefined;

        this.isTemporarilyUnsubscribedForFlush = false;
        // Re-subscribe ONLY to source deps; computed deps remain subscribed.
        if (this.sourceUnsubscribers.length === 0) {
            for (const dep of this.sourceDeps) {
                this.sourceUnsubscribers.push(
                    dep.subscribe(this.onSourceInvalidate)
                );
            }
        }
    };
}
