import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMSubscribable } from '../types/IOIMSubscribable';

/**
 * Resolves a key to its carrier — the object that holds the key's subscribers.
 * `getOrReserveCarrier` is used on subscribe (creates the carrier if absent so a
 * subscription can exist before its data); `findCarrier` resolves an existing
 * carrier for delivery/unsubscribe without creating one.
 *
 * Collection carrier = the entity slot (by pk); index carrier = the bucket
 * (by index key).
 */
export interface IOIMCarrierResolver<TKey extends TOIMPk, TCarrier> {
    getOrReserveCarrier(key: TKey): TCarrier;
    findCarrier(key: TKey): TCarrier | undefined;
}

/**
 * Keyed (per-key) pub/sub that stores handlers ON the carrier object
 * (`carrier.subscribers`) instead of a `Map<key, handlers>`. The hot path —
 * marking a written carrier dirty and delivering — needs no per-key map lookup
 * or hashing: the writer already holds the carrier.
 *
 * Same public surface as `OIMUpdateEventEmitter` (queue delivery) plus a fast
 * `markUpdatedCarrier(carrier)`, so it is a drop-in for the collection's and
 * index's keyed emitter. Reused with carrier = slot (collection) or carrier =
 * bucket (index).
 */
export class OIMCarrierKeyedEmitter<
    TKey extends TOIMPk,
    TCarrier extends IOIMSubscribable,
> {
    private readonly queue: OIMEventQueue;
    private readonly resolver: IOIMCarrierResolver<TKey, TCarrier>;
    // Carriers with at least one subscriber — for markAllUpdated / metrics.
    private readonly subscribedCarriers = new Set<TCarrier>();
    private dirtyCarriers = new Set<TCarrier>();
    private isFlushEnqueued = false;
    private dequeueFlush?: () => void;

    constructor(
        queue: OIMEventQueue,
        resolver: IOIMCarrierResolver<TKey, TCarrier>
    ) {
        this.queue = queue;
        this.resolver = resolver;
    }

    public subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>): () => void {
        const carrier = this.resolver.getOrReserveCarrier(key);
        this.addHandler(carrier, handler);
        return () => this.removeHandler(carrier, handler);
    }

    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void {
        const carriers: TCarrier[] = [];
        for (let i = 0; i < keys.length; i++) {
            const carrier = this.resolver.getOrReserveCarrier(keys[i]);
            this.addHandler(carrier, handler);
            carriers.push(carrier);
        }
        return () => {
            for (let i = 0; i < carriers.length; i++) {
                this.removeHandler(carriers[i], handler);
            }
        };
    }

    public unsubscribeFromKey(key: TKey, handler: TOIMEventHandler<void>): void {
        const carrier = this.resolver.findCarrier(key);
        if (carrier) this.removeHandler(carrier, handler);
    }

    public unsubscribeFromKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): void {
        for (let i = 0; i < keys.length; i++) {
            this.unsubscribeFromKey(keys[i], handler);
        }
    }

    private addHandler(
        carrier: TCarrier,
        handler: TOIMEventHandler<void>
    ): void {
        let subscribers = carrier.subscribers;
        if (!subscribers) {
            subscribers = new Set();
            carrier.subscribers = subscribers;
        }
        subscribers.add(handler);
        this.subscribedCarriers.add(carrier);
    }

    private removeHandler(
        carrier: TCarrier,
        handler: TOIMEventHandler<void>
    ): void {
        const subscribers = carrier.subscribers;
        if (!subscribers) return;
        subscribers.delete(handler);
        if (subscribers.size === 0) {
            this.subscribedCarriers.delete(carrier);
            // The carrier is left in place (it may still hold data or be
            // referenced elsewhere); the store/index reclaims it on remove/clear.
        }
    }

    /** Fast path: the writer already holds the carrier. */
    public markUpdatedCarrier(carrier: TCarrier): void {
        this.assertNotInFlush();
        const subscribers = carrier.subscribers;
        if (!subscribers || subscribers.size === 0) return;
        this.dirtyCarriers.add(carrier);
        this.scheduleFlush();
    }

    public markUpdatedKey(key: TKey): void {
        const carrier = this.resolver.findCarrier(key);
        if (carrier) this.markUpdatedCarrier(carrier);
        else this.assertNotInFlush();
    }

    public markUpdatedKeys(keys: readonly TKey[]): void {
        for (let i = 0; i < keys.length; i++) this.markUpdatedKey(keys[i]);
    }

    public markAllUpdated(): void {
        this.assertNotInFlush();
        if (this.subscribedCarriers.size === 0) return;
        this.subscribedCarriers.forEach(carrier =>
            this.dirtyCarriers.add(carrier)
        );
        this.scheduleFlush();
    }

    public hasSubscriptions(): boolean {
        return this.subscribedCarriers.size > 0;
    }

    public getHandlerCount(key: TKey): number {
        return this.resolver.findCarrier(key)?.subscribers?.size ?? 0;
    }

    public getMetrics(): {
        totalKeys: number;
        totalHandlers: number;
        averageHandlersPerKey: number;
        queueLength: number;
    } {
        let totalHandlers = 0;
        this.subscribedCarriers.forEach(carrier => {
            totalHandlers += carrier.subscribers?.size ?? 0;
        });
        const totalKeys = this.subscribedCarriers.size;
        return {
            totalKeys,
            totalHandlers,
            averageHandlersPerKey: totalKeys > 0 ? totalHandlers / totalKeys : 0,
            queueLength: this.dirtyCarriers.size,
        };
    }

    public destroy(): void {
        if (this.dequeueFlush) {
            this.dequeueFlush();
            this.dequeueFlush = undefined;
        }
        this.subscribedCarriers.forEach(carrier => {
            carrier.subscribers?.clear();
            carrier.subscribers = undefined;
        });
        this.subscribedCarriers.clear();
        this.dirtyCarriers.clear();
        this.isFlushEnqueued = false;
    }

    private assertNotInFlush(): void {
        if (this.queue.isInFlush) {
            throw new Error(
                'OIMCarrierKeyedEmitter: updates during queue.flush() are not allowed. ' +
                    'Finish all writes before calling queue.flush().'
            );
        }
    }

    private scheduleFlush(): void {
        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.dequeueFlush = this.queue.enqueue(this.onFlush);
    }

    private readonly onFlush = (): void => {
        this.isFlushEnqueued = false;
        this.dequeueFlush = undefined;
        if (this.dirtyCarriers.size === 0) return;

        const flushing = this.dirtyCarriers;
        this.dirtyCarriers = new Set();
        flushing.forEach(carrier => this.notify(carrier));
    };

    private notify(carrier: TCarrier): void {
        const subscribers = carrier.subscribers;
        if (!subscribers || subscribers.size === 0) return;
        // One subscriber per key is the common case — no snapshot allocation.
        if (subscribers.size === 1) {
            const only = subscribers.values().next().value;
            if (only) only();
            return;
        }
        // Snapshot so a handler may (un)subscribe during iteration safely.
        const snapshot: TOIMEventHandler<void>[] = [];
        subscribers.forEach(h => snapshot.push(h));
        for (let i = 0; i < snapshot.length; i++) {
            const handler = snapshot[i];
            if (subscribers.has(handler)) handler();
        }
    }
}
