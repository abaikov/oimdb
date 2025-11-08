import { OIMUpdateEventCoalescer } from './OIMUpdateEventCoalescer';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMIndexEventType } from '../enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../types/TOIMIndexUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Index-specific coalescer that tracks index key updates and emits consolidated change events.
 * Takes an event emitter directly instead of the whole index to avoid circular dependencies.
 */
export class OIMUpdateEventCoalescerIndex<
    TIndexKey extends TOIMPk,
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
        this.clearUpdatedKeys();
    }

    /**
     * When the index is updated, we keep track of the updated keys.
     */
    private handleUpdate = (payload: TOIMIndexUpdatePayload<TIndexKey>) => {
        this.addUpdatedKeys(payload.keys);
    };
}
