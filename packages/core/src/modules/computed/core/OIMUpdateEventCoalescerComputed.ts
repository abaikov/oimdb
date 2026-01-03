import { OIMEventEmitter } from '../../../core/OIMEventEmitter';
import { OIMUpdateEventCoalescer } from '../../../core/OIMUpdateEventCoalescer';
import { TOIMPk } from '../../../type/TOIMPk';
import { EOIMComputedEventType } from '../enum/EOIMComputedEventType';
import { TOIMComputedUpdatePayload } from '../types/TOIMComputedUpdatePayload';

export class OIMUpdateEventCoalescerComputed<
    TKey extends TOIMPk,
> extends OIMUpdateEventCoalescer<TKey> {
    constructor(
        private readonly computedEmitter: OIMEventEmitter<{
            [EOIMComputedEventType.UPDATE]: TOIMComputedUpdatePayload<TKey>;
        }>
    ) {
        super();
        this.computedEmitter.on(
            EOIMComputedEventType.UPDATE,
            this.handleUpdate
        );
    }

    public destroy(): void {
        this.computedEmitter.off(
            EOIMComputedEventType.UPDATE,
            this.handleUpdate
        );
        this.emitter.offAll();
        this.clearUpdatedKeys();
    }

    private handleUpdate = (payload: TOIMComputedUpdatePayload<TKey>) => {
        this.addUpdatedKeys(payload.keys);
    };
}
