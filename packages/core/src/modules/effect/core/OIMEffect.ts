import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { EOIMEventQueueEventType } from '../../../enum/EOIMEventQueueEventType';
import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { TOIMEffectOptions } from '../types/TOIMEffectOptions';

export class OIMEffect {
    private readonly queue: OIMEventQueue;
    private readonly phase: EOIMEffectPhase;
    private readonly onInvalidate?: () => void;
    private readonly run: () => void;
    private readonly deps: readonly IOIMEffectDependency[];

    private unsubscribers: Array<() => void> = [];
    private isDestroyed = false;

    private isInFlush = false;
    private hasRunInThisFlush = false;
    private isScheduled = false;

    private readonly handleQueueBeforeFlush = () => {
        this.isInFlush = true;
        this.hasRunInThisFlush = false;
    };

    private readonly handleQueueAfterFlush = () => {
        this.isInFlush = false;
        this.hasRunInThisFlush = false;
    };

    private readonly runTask = () => {
        this.isScheduled = false;
        if (this.isDestroyed) return;

        // When executed from queue task, we are in the "handlers phase" of the queue,
        // but phase semantics are determined by where invalidate is called (dependency subscription).
        // This task is only a fallback for invalidations happening outside a flush.
        this.runOnce();
    };

    constructor(queue: OIMEventQueue, opts: TOIMEffectOptions) {
        this.queue = queue;
        this.phase = opts.phase;
        this.onInvalidate = opts.onInvalidate;
        this.run = opts.run;
        this.deps = opts.deps ?? [];

        this.queue.emitter.on(
            EOIMEventQueueEventType.BEFORE_FLUSH,
            this.handleQueueBeforeFlush
        );
        this.queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.handleQueueAfterFlush
        );

        for (const dep of this.deps) {
            this.unsubscribers.push(dep.subscribe(this.phase, this.invalidate));
        }
    }

    public destroy(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers = [];

        this.queue.emitter.off(
            EOIMEventQueueEventType.BEFORE_FLUSH,
            this.handleQueueBeforeFlush
        );
        this.queue.emitter.off(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.handleQueueAfterFlush
        );
    }

    private invalidate = () => {
        if (this.isDestroyed) return;
        this.onInvalidate?.();

        if (this.isInFlush) {
            // Coalesce within a flush: run at most once.
            if (this.hasRunInThisFlush) return;
            this.hasRunInThisFlush = true;
            this.runOnce();
            return;
        }

        // If invalidated outside of a flush, schedule execution.
        if (this.isScheduled) return;
        this.isScheduled = true;
        this.queue.enqueue(this.runTask);
    };

    private runOnce(): void {
        if (this.isDestroyed) return;
        this.run();
    }
}
