import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMUpdateEventCoalescerEventType } from '../enum/EOIMUpdateEventCoalescerEventType';
import { OIMIndexManualSetBased } from './OIMIndexManualSetBased';
import { OIMIndexStoreMapDrivenSetBased } from './OIMIndexStoreMapDrivenSetBased';
import { TOIMPk } from '../types/TOIMPk';
import { OIMDBSettings } from '../const/OIMDBSettings';

/**
 * Base abstract coalescer that groups updates by keys and emits consolidated events.
 * Designed to be extended for different entity types (collections, indexes, etc.).
 * Uses SetBased indexes for efficient key tracking.
 */
export abstract class OIMUpdateEventCoalescer<TKey extends TOIMPk> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMUpdateEventCoalescerEventType.HAS_CHANGES]: void;
        [EOIMUpdateEventCoalescerEventType.BEFORE_FLUSH]: void;
        [EOIMUpdateEventCoalescerEventType.AFTER_FLUSH]: void;
    }>();

    protected readonly updatedKeysIndex: OIMIndexManualSetBased<
        typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
        TKey
    >;
    private hasEmittedChanges = false;

    constructor(
        index?: OIMIndexManualSetBased<
            typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
            TKey
        >
    ) {
        this.updatedKeysIndex =
            index ??
            new OIMIndexManualSetBased<
                typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
                TKey
            >({
                store: new OIMIndexStoreMapDrivenSetBased<
                    typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
                    TKey
                >(),
            });
        // Initialize the set if it doesn't exist
        if (
            !this.updatedKeysIndex.hasKey(OIMDBSettings.UPDATED_KEYS_INDEX_KEY)
        ) {
            this.updatedKeysIndex.setPks(
                OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
                []
            );
        }
    }

    /**
     * Get the set of keys that have been updated since last clear
     */
    public getUpdatedKeys(): Set<TKey> {
        return this.updatedKeysIndex.getPksByKey(
            OIMDBSettings.UPDATED_KEYS_INDEX_KEY
        );
    }

    /**
     * Clear all updated keys and reset the changed state
     */
    public clearUpdatedKeys(): void {
        this.emitter.emit(
            EOIMUpdateEventCoalescerEventType.BEFORE_FLUSH,
            undefined
        );
        this.updatedKeysIndex.setPks(OIMDBSettings.UPDATED_KEYS_INDEX_KEY, []);
        this.hasEmittedChanges = false;
        this.emitter.emit(
            EOIMUpdateEventCoalescerEventType.AFTER_FLUSH,
            undefined
        );
    }

    /**
     * Add keys to the updated set and emit HAS_CHANGES event if needed
     */
    protected addUpdatedKeys(keys: readonly TKey[]): void {
        this.updatedKeysIndex.addPks(
            OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
            keys
        );

        if (!this.hasEmittedChanges) {
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
