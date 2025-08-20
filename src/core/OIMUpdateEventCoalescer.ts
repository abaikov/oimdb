import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMUpdateEventCoalescerEventType } from '../types/EOIMUpdateEventCoalescerEventType';

/**
 * Base abstract coalescer that groups updates by keys and emits consolidated events.
 * Designed to be extended for different entity types (collections, indexes, etc.).
 */
export abstract class OIMUpdateEventCoalescer<TKey> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMUpdateEventCoalescerEventType.HAS_CHANGES]: void;
    }>();

    protected updatedKeys = new Set<TKey>();
    private hasEmittedChanges = false;

    /**
     * Get the set of keys that have been updated since last clear
     */
    public getUpdatedKeys(): Set<TKey> {
        return this.updatedKeys;
    }

    /**
     * Clear all updated keys and reset the changed state
     */
    public clearUpdatedKeys(): void {
        this.updatedKeys.clear();
        this.hasEmittedChanges = false;
    }

    /**
     * Add keys to the updated set and emit HAS_CHANGES event if needed
     */
    protected addUpdatedKeys(keys: TKey[]): void {
        const hadChanges = this.updatedKeys.size > 0;

        for (const key of keys) {
            this.updatedKeys.add(key);
        }

        // Only emit HAS_CHANGES once per update cycle
        if (
            !hadChanges &&
            this.updatedKeys.size > 0 &&
            !this.hasEmittedChanges
        ) {
            this.hasEmittedChanges = true;
            this.emitter.emit(
                EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
                undefined
            );
        }
    }

    /**
     * Clean up event listeners when coalescer is no longer needed
     */
    public abstract destroy(): void;
}
