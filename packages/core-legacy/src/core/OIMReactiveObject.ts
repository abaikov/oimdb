import { OIMObject } from './OIMObject';
import type { OIMEventQueue } from './OIMEventQueue';
import { OIMCarrierKeyedEmitter } from './OIMCarrierKeyedEmitter';
import { OIMKeyedCarrierProvider } from './OIMKeyedCarrierProvider';
import type { IOIMKeyCarrier } from '../interfaces/IOIMKeyCarrier';
import type { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import type { TOIMObjectOptions } from '../types/TOIMObjectOptions';

export class OIMReactiveObject<TKey extends string, TValue>
    extends OIMObject<TKey, TValue> {
    public readonly emitter: IOIMKeyedUpdateEmitter<TKey>;

    constructor(queue: OIMEventQueue, opts?: TOIMObjectOptions<TKey, TValue>) {
        super(opts);
        // Carrier-based keyed emitter: marking a written key dirty is an O(1)
        // flag set on its carrier, with no per-key map lookup or payload.
        this.emitter = new OIMCarrierKeyedEmitter<
            TKey,
            IOIMKeyCarrier<TKey>
        >(queue, new OIMKeyedCarrierProvider<TKey>());
    }

    /**
     * Mark the written key(s) on the keyed emitter directly — no general-event
     * bridge, no `{ keys }` payload on the single-key path. `super` still fires
     * the general UPDATE event for any low-level `emitter` subscribers.
     */
    protected override onUpdatedKey(key: TKey): void {
        this.emitter.markUpdatedKey(key);
        super.onUpdatedKey(key);
    }

    protected override onUpdatedKeys(keys: TKey[]): void {
        this.emitter.markUpdatedKeys(keys);
        super.onUpdatedKeys(keys);
    }








    public override destroy(): void {
        this.emitter.destroy();
        super.destroy();
    }
}
