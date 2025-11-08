import { OIMUpdateEventCoalescer } from './OIMUpdateEventCoalescer';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMCollectionEventType } from '../enum/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../types/TOIMCollectionUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';
import { EOIMUpdateEventCoalescerEventType } from '../enum/EOIMUpdateEventCoalescerEventType';

/**
 * Collection-specific coalescer that tracks primary key updates and emits consolidated change events.
 * Takes an event emitter directly instead of the whole collection to avoid circular dependencies.
 */
export class OIMUpdateEventCoalescerCollection<
    TPk extends TOIMPk,
> extends OIMUpdateEventCoalescer<TPk> {
    constructor(
        private readonly collectionEmitter: OIMEventEmitter<{
            [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
        }>
    ) {
        super();
        this.collectionEmitter.on(
            EOIMCollectionEventType.UPDATE,
            this.handleUpdate
        );
    }

    public destroy() {
        this.collectionEmitter.off(
            EOIMCollectionEventType.UPDATE,
            this.handleUpdate
        );
        this.emitter.offAll();
        this.clearUpdatedKeys();
    }

    /**
     * When the collection is updated, we keep track of the updated pks.
     */
    private handleUpdate = (payload: TOIMCollectionUpdatePayload<TPk>) => {
        this.addUpdatedKeys(payload.pks);
    };
}
