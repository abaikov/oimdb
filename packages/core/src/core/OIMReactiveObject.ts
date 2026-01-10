import { OIMObject } from './OIMObject';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';
import { TOIMObjectOptions } from '../type/TOIMObjectOptions';
import { EOIMObjectEventType } from '../enum/EOIMObjectEventType';
import { TOIMEventHandler } from '../type/TOIMEventHandler';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';

export class OIMReactiveObject<TKey extends string, TValue>
    extends OIMObject<TKey, TValue>
    implements IOIMKeyedSubscription<TKey>
{
    protected readonly updateEmitter: OIMUpdateEventEmitter<TKey>;

    constructor(queue: OIMEventQueue, opts?: TOIMObjectOptions<TKey, TValue>) {
        super(opts);
        this.updateEmitter = new OIMUpdateEventEmitter<TKey>(queue, 'queue');

        // Internal bridge: object emitter -> updateEventEmitter batching.
        this.emitter.on(EOIMObjectEventType.UPDATE, payload => {
            this.updateEmitter.markUpdatedKeys(payload.keys);
        });
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
