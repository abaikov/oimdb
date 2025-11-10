import {
    OIMEventEmitter,
    EOIMIndexEventType,
    TOIMIndexUpdatePayload,
    TOIMPk,
    EOIMUpdateEventCoalescerEventType,
    OIMUpdateEventCoalescer,
} from '@oimdb/core';
import { OIMUpdateEventCoalescerIndexAsync } from './OIMUpdateEventCoalescerIndexAsync';

/**
 * Adapter that wraps OIMUpdateEventCoalescerIndexAsync and extends OIMUpdateEventCoalescer
 * to provide type compatibility with OIMUpdateEventEmitter.
 */
export class OIMUpdateEventCoalescerIndexAsyncAdapter<
    TIndexKey extends TOIMPk,
> extends OIMUpdateEventCoalescer<TIndexKey> {
    private readonly asyncCoalescer: OIMUpdateEventCoalescerIndexAsync<TIndexKey>;

    constructor(
        indexEmitter: OIMEventEmitter<{
            [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TIndexKey>;
        }>
    ) {
        // Base class will create default index (won't be used, async coalescer handles it)
        super();

        // Create async coalescer
        this.asyncCoalescer = new OIMUpdateEventCoalescerIndexAsync<TIndexKey>(
            indexEmitter
        );

        // Forward events from async coalescer to base class emitter
        this.asyncCoalescer.emitter.on(
            EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
            () => {
                this.emitter.emit(
                    EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
                    undefined
                );
            }
        );
    }

    /**
     * Override to use async coalescer's cache
     */
    public getUpdatedKeys(): Set<TIndexKey> {
        return this.asyncCoalescer.getUpdatedKeys();
    }

    /**
     * Override to use async coalescer's cache
     */
    public clearUpdatedKeys(): void {
        this.asyncCoalescer.clearUpdatedKeys();
    }

    /**
     * Clean up both base class and async coalescer
     */
    public destroy(): void {
        this.emitter.offAll();
        this.clearUpdatedKeys();
        this.asyncCoalescer.destroy();
    }
}

