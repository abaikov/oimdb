import { OIMEventEmitter } from './OIMEventEmitter';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';
import { EOIMIndexEventType } from '../enums/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../types/TOIMIndexUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';

type TOIMIndexEmitter<TKey extends TOIMPk> = OIMEventEmitter<{
    [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TKey>;
}>;

export class OIMUpdateEventEmitterIndex<
    TKey extends TOIMPk,
> extends OIMUpdateEventEmitter<TKey> {
    private unsubscribe?: () => void;

    constructor(queue: OIMEventQueue, indexEmitter: TOIMIndexEmitter<TKey>) {
        super(queue);
        this.unsubscribe = indexEmitter.on(
            EOIMIndexEventType.UPDATE,
            payload => {
                this.markUpdatedKeys(payload.keys);
            }
        );
    }

    public override destroy() {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        super.destroy();
    }
}
