import type { TOIMKey } from '../types/TOIMKey';
import type { OIMEventEmitter } from './OIMEventEmitter';
import type { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitterQueued } from './OIMUpdateEventEmitterQueued';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import type { TOIMCollectionUpdatePayload } from '../types/TOIMCollectionUpdatePayload';

type TOIMCollectionEmitter<TPk extends TOIMKey> = OIMEventEmitter<{
    [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
}>;

export class OIMUpdateEventEmitterCollection<
    TPk extends TOIMKey,
> extends OIMUpdateEventEmitterQueued<TPk> {
    private unsubscribe?: () => void;

    constructor(
        queue: OIMEventQueue,
        collectionEmitter: TOIMCollectionEmitter<TPk>
    ) {
        super(queue);
        this.unsubscribe = collectionEmitter.on(
            EOIMCollectionEventType.UPDATE,
            payload => {
                this.markUpdatedKeys(payload.pks);
            }
        );
    }

    public override destroy() {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        super.destroy();
    }
}
