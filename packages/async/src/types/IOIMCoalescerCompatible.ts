import {
    OIMEventEmitter,
    EOIMUpdateEventCoalescerEventType,
    TOIMPk,
} from '@oimdb/core';

/**
 * Interface for coalescer compatibility with OIMUpdateEventEmitter.
 * Defines the minimum interface required for a coalescer to work with event emitter.
 */
export interface IOIMCoalescerCompatible<TKey extends TOIMPk> {
    readonly emitter: OIMEventEmitter<{
        [EOIMUpdateEventCoalescerEventType.HAS_CHANGES]: void;
    }>;
    getUpdatedKeys(): Set<TKey>;
    clearUpdatedKeys(): void;
}

