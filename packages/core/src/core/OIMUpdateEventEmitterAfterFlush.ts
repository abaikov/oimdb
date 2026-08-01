import { TOIMKey } from '../types/TOIMKey';
import { OIMEventQueue } from './OIMEventQueue';
import { EOIMEventQueueEventType } from '../enums/EOIMEventQueueEventType';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';

/**
 * Delivers once the frame is over.
 *
 * For consumers that do not react to a change but ACCUMULATE a description of
 * the whole frame — an ordered-list command stream folding inserts and moves,
 * a changed-field tracker collecting which fields moved — and can only publish
 * that description once it is complete. Delivering mid-frame would hand out a
 * half-written account of what happened.
 */
export class OIMUpdateEventEmitterAfterFlush<
    TKey extends TOIMKey,
> extends OIMUpdateEventEmitter<TKey> {
    private isDeliveryScheduled = false;
    private readonly unsubscribeFromQueue: () => void;

    constructor(queue: OIMEventQueue) {
        super(queue);
        this.unsubscribeFromQueue = queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.onAfterFlush
        );
    }

    protected scheduleDelivery(): void {
        this.isDeliveryScheduled = true;
    }

    public override destroy(): void {
        this.unsubscribeFromQueue();
        super.destroy();
    }

    private readonly onAfterFlush = (): void => {
        if (!this.isDeliveryScheduled) return;
        this.isDeliveryScheduled = false;
        this.runSinglePass();
    };
}
