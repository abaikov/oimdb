import { OIMEventEmitter } from './OIMEventEmitter';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';
import { EOIMCollectionEventType } from '../enum/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../type/TOIMCollectionUpdatePayload';
import { TOIMPk } from '../type/TOIMPk';

type TOIMCollectionEmitter<TPk extends TOIMPk> = OIMEventEmitter<{
    [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
}>;

export class OIMUpdateEventEmitterCollection<
    TPk extends TOIMPk,
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
