import { TOIMKey } from '../types/TOIMKey';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';

/**
 * Delivers inside the next `queue.flush()`.
 *
 * The default shape: a reaction to changed data, coalesced so a key wakes its
 * subscribers once per frame however many times it was written.
 *
 * This is also the only emitter that refuses to be marked mid-frame, and the
 * reason is specific to it rather than a general rule: its delivery IS the frame,
 * so a mark arriving during one would either join a batch already being handed
 * out or silently slip into the next. Both are the kind of ordering bug that
 * shows up as a missing render three screens away. The emitters that deliver
 * after the frame, or immediately, have no such ambiguity and no such guard.
 */
export class OIMUpdateEventEmitterQueued<
    TKey extends TOIMKey,
> extends OIMUpdateEventEmitter<TKey> {
    public override markUpdatedKey(key: TKey): void {
        this.assertNotInFrame();
        super.markUpdatedKey(key);
    }

    public override markUpdatedKeys(keys: readonly TKey[]): void {
        if (keys.length === 0) return;
        this.assertNotInFrame();
        super.markUpdatedKeys(keys);
    }

    public override markAllUpdated(): void {
        this.assertNotInFrame();
        super.markAllUpdated();
    }

    protected scheduleDelivery(): void {
        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.queue.enqueue(this.onFlush);
    }

    private assertNotInFrame(): void {
        if (!this.queue.isInFlush) return;
        throw new Error(
            'OIMUpdateEventEmitterQueued: updates during queue.flush() are not allowed. ' +
                'A frame is one reporting cycle — the task drain AND the effect phase — so ' +
                'finish all writes before flushing, and let effects read rather than write.'
        );
    }
}
