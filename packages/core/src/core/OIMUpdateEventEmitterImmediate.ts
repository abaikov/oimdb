import { TOIMKey } from '../types/TOIMKey';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';

/**
 * Delivers synchronously, in the same call that marked the key.
 *
 * For advancing a graph rather than reporting to the outside world: a computed
 * publishing its new value while the effect phase runs. Queueing that would
 * stretch a three-link chain across three frames, and deferring it to the end of
 * the frame would publish after the effects that needed to read it.
 *
 * Because it never queues, it is also the emitter that may be marked mid-frame —
 * the mid-frame guard belongs to the queued one, where it means something.
 */
export class OIMUpdateEventEmitterImmediate<
    TKey extends TOIMKey,
> extends OIMUpdateEventEmitter<TKey> {
    protected scheduleDelivery(): void {
        this.runSinglePass();
    }
}
