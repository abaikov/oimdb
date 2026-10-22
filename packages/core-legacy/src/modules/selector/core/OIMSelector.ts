import type { OIMEventQueue } from '../../../core/OIMEventQueue';
import type { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';
import { OIMEffect } from '../../effect/core/OIMEffect';
import type { IOIMSelectorComputedDependency } from '../interfaces/IOIMSelectorComputedDependency';
import type { IOIMSelectorSourceDependency } from '../interfaces/IOIMSelectorSourceDependency';

/**
 * A watchable value derived from reactive sources, delivered on flush and only
 * when it actually changed.
 *
 * The graph work — holding dependencies, subscribing, collapsing several
 * invalidations in one frame into one run, scheduling by topological level — is
 * an {@link OIMEffect}. This class owns only what is selector-specific: the
 * listeners, the last delivered value, and the equality that decides whether a
 * new value is worth delivering.
 *
 * It used to reimplement the effect rather than compose it, and the copies
 * drifted: a fix to how invalidations are deduplicated within a flush landed in
 * the effect and silently did not land here. One node type, one place to fix.
 */
export abstract class OIMSelector<TValue> {
    private readonly listeners = new Set<(value: TValue) => void>();
    /**
     * Built once, then activated and deactivated as watchers come and go — a
     * selector nobody watches holds no subscriptions and cannot fire.
     */
    private readonly effect: OIMEffect;

    private hasLastValue = false;
    private lastValue!: TValue;

    protected get queue(): OIMEventQueue {
        return this.runtime.queue;
    }

    protected constructor(
        protected readonly runtime: OIMComputeRuntime,
        protected readonly sourceDeps: readonly IOIMSelectorSourceDependency[],
        protected readonly computedDeps: readonly IOIMSelectorComputedDependency[] = []
    ) {
        this.effect = new OIMEffect(runtime, {
            deps: [...sourceDeps, ...computedDeps],
            run: this.deliver,
            startActive: false,
        });
    }

    public abstract getValue(): TValue;

    /**
     * Start watching this selector. The callback is called immediately with the
     * current value, then coalesced and delivered on `queue.flush()` whenever the
     * value changes.
     */
    public watch(onValue: (value: TValue) => void): () => void {
        this.listeners.add(onValue);
        if (this.listeners.size === 1) this.effect.activate();

        const current = this.getValue();
        this.setLastValue(current);
        onValue(current);

        return () => {
            this.listeners.delete(onValue);
            if (this.listeners.size > 0) return;
            // Last watcher gone: stop listening, and forget the delivered value
            // so the next watcher is greeted with a fresh read rather than a
            // comparison against something nobody has seen for a while.
            this.effect.deactivate();
            this.hasLastValue = false;
        };
    }

    protected areEqual(prev: TValue, next: TValue): boolean {
        return Object.is(prev, next);
    }

    private readonly deliver = (): void => {
        if (this.listeners.size === 0) return;

        const next = this.getValue();
        // Equality belongs to the selector: the sources report that something
        // moved, this decides whether that means anything to a watcher.
        if (this.hasLastValue && this.areEqual(this.lastValue, next)) return;

        this.setLastValue(next);

        const snapshot = Array.from(this.listeners);
        for (let i = 0; i < snapshot.length; i++) {
            const listener = snapshot[i];
            if (this.listeners.has(listener)) listener(next);
        }
    };

    private setLastValue(value: TValue): void {
        this.lastValue = value;
        this.hasLastValue = true;
    }
}
