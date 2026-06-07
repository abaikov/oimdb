import { OIMObject } from './OIMObject';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMCarrierKeyedEmitter } from './OIMCarrierKeyedEmitter';
import { OIMKeyedCarrierResolver } from './OIMKeyedCarrierResolver';
import { IOIMKeyCarrier } from '../interfaces/IOIMKeyCarrier';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import { TOIMObjectOptions } from '../types/TOIMObjectOptions';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';

export class OIMReactiveObject<TKey extends string, TValue>
    extends OIMObject<TKey, TValue>
    implements IOIMKeyedSubscription<TKey>
{
    protected readonly updateEmitter: IOIMKeyedUpdateEmitter<TKey>;

    constructor(queue: OIMEventQueue, opts?: TOIMObjectOptions<TKey, TValue>) {
        super(opts);
        // Carrier-based keyed emitter: marking a written key dirty is an O(1)
        // flag set on its carrier, with no per-key map lookup or payload.
        this.updateEmitter = new OIMCarrierKeyedEmitter<
            TKey,
            IOIMKeyCarrier<TKey>
        >(queue, new OIMKeyedCarrierResolver<TKey>());
    }

    /**
     * Mark the written key(s) on the keyed emitter directly — no general-event
     * bridge, no `{ keys }` payload on the single-key path. `super` still fires
     * the general UPDATE event for any low-level `emitter` subscribers.
     */
    protected override onUpdatedKey(key: TKey): void {
        this.updateEmitter.markUpdatedKey(key);
        super.onUpdatedKey(key);
    }

    protected override onUpdatedKeys(keys: TKey[]): void {
        this.updateEmitter.markUpdatedKeys(keys);
        super.onUpdatedKeys(keys);
    }

    public subscribeOnKey(
        key: TKey,
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.updateEmitter.subscribeOnKey(key, handler);
    }

    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.updateEmitter.subscribeOnKeys(keys, handler);
    }

    public unsubscribeFromKey(
        key: TKey,
        handler: TOIMEventHandler<void>
    ): void {
        this.updateEmitter.unsubscribeFromKey(key, handler);
    }

    public unsubscribeFromKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): void {
        this.updateEmitter.unsubscribeFromKeys(keys, handler);
    }

    public hasSubscriptions(): boolean {
        return this.updateEmitter.hasSubscriptions();
    }

    public getHandlerCount(key: TKey): number {
        return this.updateEmitter.getHandlerCount(key);
    }

    public getMetrics() {
        return this.updateEmitter.getMetrics();
    }

    public override destroy(): void {
        this.updateEmitter.destroy();
        super.destroy();
    }
}
