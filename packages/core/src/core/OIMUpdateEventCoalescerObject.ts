import { OIMUpdateEventCoalescer } from './OIMUpdateEventCoalescer';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMObjectEventType } from '../enum/EOIMObjectEventType';
import { TOIMUpdatePayload } from '../type/TOIMUpdatePayload';

/**
 * Object-specific coalescer that tracks property key updates and emits consolidated change events.
 * Takes an event emitter directly instead of the whole object to avoid circular dependencies.
 */
export class OIMUpdateEventCoalescerObject<
    TKey extends string,
> extends OIMUpdateEventCoalescer<TKey> {
    constructor(
        private readonly objectEmitter: OIMEventEmitter<{
            [EOIMObjectEventType.UPDATE]: TOIMUpdatePayload<TKey>;
        }>
    ) {
        super();
        this.objectEmitter.on(EOIMObjectEventType.UPDATE, this.handleUpdate);
    }

    public destroy() {
        this.objectEmitter.off(EOIMObjectEventType.UPDATE, this.handleUpdate);
        this.emitter.offAll();
        this.clearUpdatedKeys();
    }

    /**
     * When the object is updated, we keep track of the updated keys.
     */
    private handleUpdate = (payload: TOIMUpdatePayload<TKey>) => {
        this.addUpdatedKeys(payload.keys);
    };
}
