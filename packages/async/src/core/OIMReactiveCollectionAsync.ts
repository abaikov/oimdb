import {
    OIMEventQueue,
    OIMUpdateEventCoalescerCollection,
    OIMUpdateEventEmitter,
    TOIMPk,
} from '@oimdb/core';
import { OIMCollectionAsync } from './OIMCollectionAsync';
import { TOIMCollectionOptionsAsync } from '../types/TOIMCollectionOptionsAsync';

/**
 * Reactive async collection with event support.
 * Extends OIMCollectionAsync with reactive event system.
 */
export class OIMReactiveCollectionAsync<
    TEntity extends object,
    TPk extends TOIMPk,
> extends OIMCollectionAsync<TEntity, TPk> {
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TPk>;
    public readonly coalescer: OIMUpdateEventCoalescerCollection<TPk>;

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionOptionsAsync<TEntity, TPk>
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

