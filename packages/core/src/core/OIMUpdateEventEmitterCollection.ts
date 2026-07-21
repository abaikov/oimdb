import { TOIMKey } from '../types/TOIMKey';
import { OIMEventEmitter } from './OIMEventEmitter';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../types/TOIMCollectionUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';

type TOIMCollectionEmitter<TPk extends TOIMKey> = OIMEventEmitter<{
    [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
}>;

export class OIMUpdateEventEmitterCollection<
    TPk extends TOIMKey,
> extends OIMUpdateEventEmitter<TPk> {
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
