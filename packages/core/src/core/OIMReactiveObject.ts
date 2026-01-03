import { OIMObject } from './OIMObject';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';
import { OIMUpdateEventCoalescerObject } from './OIMUpdateEventCoalescerObject';
import { TOIMObjectOptions } from '../type/TOIMObjectOptions';

export class OIMReactiveObject<TKey extends string, TValue> extends OIMObject<
    TKey,
    TValue
> {
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TKey>;
    public readonly coalescer: OIMUpdateEventCoalescerObject<TKey>;

    constructor(queue: OIMEventQueue, opts?: TOIMObjectOptions<TKey, TValue>) {
        super(opts);
        this.coalescer = new OIMUpdateEventCoalescerObject<TKey>(this.emitter);
        this.updateEventEmitter = new OIMUpdateEventEmitter<TKey>({
            coalescer: this.coalescer,
            queue,
        });
    }

    public override destroy(): void {
        this.updateEventEmitter.destroy();
        this.coalescer.destroy();
        super.destroy();
    }
}
