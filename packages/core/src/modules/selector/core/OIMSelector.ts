import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';
import { IOIMSelectorComputedDependency } from '../interfaces/IOIMSelectorComputedDependency';
import { IOIMSelectorSourceDependency } from '../interfaces/IOIMSelectorSourceDependency';

export abstract class OIMSelector<TValue> {
    private readonly listeners = new Set<(value: TValue) => void>();
    private sourceUnsubscribers: Array<() => void> = [];
    private computedUnsubscribers: Array<() => void> = [];
    private dequeueResubscribe?: () => void;
    private isResubscribeEnqueued = false;
    private isTemporarilyUnsubscribedForFlush = false;

    private isDeliveryEnqueued = false;
    private dequeueDelivery?: () => void;

    private hasLastValue = false;
    private lastValue!: TValue;

    protected get queue(): OIMEventQueue {
        return this.runtime.queue;
    }

    protected constructor(
        protected readonly runtime: OIMComputativeRuntime,
        protected readonly sourceDeps: readonly IOIMSelectorSourceDependency[],
        protected readonly computedDeps: readonly IOIMSelectorComputedDependency[] = []
    ) {}

    public abstract getValue(): TValue;

    /**
     * Start watching this selector. The callback is called immediately with the current value,
     * then coalesced and delivered on `queue.flush()` when the selector invalidates.
     */
    public watch(onValue: (value: TValue) => void): () => void {
        this.listeners.add(onValue);

        if (this.listeners.size === 1) {
            this.subscribeToDeps();
        }

        const current = this.getValue();
        this.setLastValue(current);
        onValue(current);

        return () => {
            this.listeners.delete(onValue);
            if (this.listeners.size > 0) return;

            this.unsubscribeFromAllDeps();

            if (this.dequeueResubscribe) {
                this.dequeueResubscribe();
                this.dequeueResubscribe = undefined;
            }
            this.isResubscribeEnqueued = false;
            this.isTemporarilyUnsubscribedForFlush = false;

            if (this.dequeueDelivery) {
                this.dequeueDelivery();
                this.dequeueDelivery = undefined;
            }
            this.isDeliveryEnqueued = false;
            this.hasLastValue = false;
        };
    }

    protected areEqual(prev: TValue, next: TValue): boolean {
        return Object.is(prev, next);
    }

    private readonly onSourceInvalidate = () => {
        if (this.listeners.size === 0) return;

        // If any source dependency fired during the current flush, unsubscribe from everything
        // and re-subscribe at AFTER_FLUSH to avoid multiple invalidations within the same flush.
        if (!this.isTemporarilyUnsubscribedForFlush) {
            this.isTemporarilyUnsubscribedForFlush = true;
            this.unsubscribeFromSourceDeps();
            this.ensureResubscribeAfterFlush();
        }

        if (this.isDeliveryEnqueued) return;
        this.isDeliveryEnqueued = true;
        this.dequeueDelivery = this.runtime.schedule(this.deliver);
    };

    private readonly onComputedInvalidate = () => {
        if (this.listeners.size === 0) return;
        if (this.isDeliveryEnqueued) return;
        this.isDeliveryEnqueued = true;
        this.dequeueDelivery = this.runtime.schedule(this.deliver);
    };

    private readonly deliver = () => {
        this.isDeliveryEnqueued = false;
        this.dequeueDelivery = undefined;

        if (this.listeners.size === 0) return;

        const next = this.getValue();

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
        for (const unsub of this.sourceUnsubscribers) unsub();
        this.sourceUnsubscribers = [];
    }

    private unsubscribeFromAllDeps(): void {
        this.unsubscribeFromSourceDeps();
        if (this.computedUnsubscribers.length === 0) return;
        for (const unsub of this.computedUnsubscribers) unsub();
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

        if (this.listeners.size === 0) return;
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
