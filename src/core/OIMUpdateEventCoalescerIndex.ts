import { OIMUpdateEventCoalescer } from './OIMUpdateEventCoalescer';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMIndexEventType } from '../enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../types/TOIMIndexUpdatePayload';
import { EOIMUpdateEventCoalescerEventType } from '../types/EOIMUpdateEventCoalescerEventType';

/**
 * Index-specific coalescer that tracks index key updates and emits consolidated change events.
 * Takes an event emitter directly instead of the whole index to avoid circular dependencies.
 */
export class OIMUpdateEventCoalescerIndex<
    TIndexKey,
> extends OIMUpdateEventCoalescer<TIndexKey> {
    constructor(
        private readonly indexEmitter: OIMEventEmitter<{
            [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TIndexKey>;
        }>
    ) {
        super();
        this.indexEmitter.on(EOIMIndexEventType.UPDATE, this.handleUpdate);
    }

    public destroy() {
        this.indexEmitter.off(EOIMIndexEventType.UPDATE, this.handleUpdate);
        this.emitter.offAll();
        this.updatedKeys.clear();
    }

    /**
     * When the index is updated, we keep track of the updated keys.
     */
    private handleUpdate = (payload: TOIMIndexUpdatePayload<TIndexKey>) => {
        // Direct iteration instead of array spreading for better performance
        const hadChanges = this.updatedKeys.size > 0;

        for (const key of payload.keys) {
            this.updatedKeys.add(key);
        }

        // Emit HAS_CHANGES only once per update cycle
        if (!hadChanges && this.updatedKeys.size > 0) {
            this.emitter.emit(
                EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
                undefined
            );
        }
    };
}
