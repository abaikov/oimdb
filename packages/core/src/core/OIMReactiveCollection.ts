import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMCollection } from './OIMCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMUpdateEventCoalescerCollection } from './OIMUpdateEventCoalescerCollection';
import { OIMUpdateEventEmitter } from './OIMUpdateEventEmitter';

export class OIMReactiveCollection<
    TEntity extends object,
    TPk extends TOIMPk,
> extends OIMCollection<TEntity, TPk> {
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TPk>;
    public readonly coalescer: OIMUpdateEventCoalescerCollection<TPk>;

    constructor(
        queue: OIMEventQueue,
        opts?: TOIMCollectionOptions<TEntity, TPk>
    ) {
        super(opts);
        this.coalescer = new OIMUpdateEventCoalescerCollection<TPk>(
            this.emitter
        );
        this.updateEventEmitter = new OIMUpdateEventEmitter<TPk>({
            coalescer: this.coalescer,
            queue,
        });
    }
}
