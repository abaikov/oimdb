import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';

/**
 * Keyless (single-carrier) pub/sub. The emitter IS the carrier: it holds one
 * subscriber set and one dirty flag, so the hot path — marking updated and
 * delivering — needs no provider, no `Map`, no per-key hashing, and no
 * `dirtyCarriers[]` batch (there is only ever one carrier).
 *
 * This is the {@link OIMCarrierKeyedEmitter} analogue for a whole-collection
 * ("Global") reactive index. Every op here is strictly cheaper than its keyed
 * counterpart: `subscribe` is one `Set.add` (no `getOrReserveCarrier`),
 * `markUpdated` is a flag flip + a single `queue.enqueue` (no map lookup, no
 * array push).
 */
export class OIMCarrierSingleEmitter implements IOIMSingleUpdateEmitter {
    private readonly queue: OIMEventQueue;
    private subscribers?: Set<TOIMEventHandler<void>>;
    private dirty = false;
    private isFlushEnqueued = false;

    constructor(queue: OIMEventQueue) {
        this.queue = queue;
    }

    public subscribe(handler: TOIMEventHandler<void>): () => void {
        let subscribers = this.subscribers;
        if (!subscribers) {
            subscribers = new Set();
            this.subscribers = subscribers;
        }
        subscribers.add(handler);
        return () => {
            this.subscribers?.delete(handler);
        };
    }

    public markUpdated(): void {
        this.assertNotInFlush();
        if (!this.subscribers || this.subscribers.size === 0) return;
        if (this.dirty) return; // already in the pending batch
        this.dirty = true;
        this.scheduleFlush();
    }

    public hasSubscriptions(): boolean {
        return !!this.subscribers && this.subscribers.size > 0;
    }

    public getMetrics(): { totalHandlers: number; queueLength: number } {
        return {
            totalHandlers: this.subscribers?.size ?? 0,
            queueLength: this.dirty ? 1 : 0,
        };
    }

    public destroy(): void {
        if (this.isFlushEnqueued) {
            this.queue.cancel(this.onFlush);
            this.isFlushEnqueued = false;
        }
        this.subscribers?.clear();
        this.subscribers = undefined;
        this.dirty = false;
    }

    private assertNotInFlush(): void {
        if (this.queue.isInFlush) {
            throw new Error(
                'OIMCarrierSingleEmitter: updates during queue.flush() are not allowed. ' +
                    'Finish all writes before calling queue.flush().'
            );
        }
    }

    private scheduleFlush(): void {
        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.queue.enqueue(this.onFlush);
    }

    private readonly onFlush = (): void => {
        this.isFlushEnqueued = false;
        if (!this.dirty) return;
        // Clear before notifying: even if a handler throws, the carrier is left
        // re-markable rather than stuck dirty.
        this.dirty = false;
        this.notify();
    };

    private notify(): void {
        const subscribers = this.subscribers;
        if (!subscribers || subscribers.size === 0) return;
        // One subscriber is the common case — no snapshot allocation.
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
