import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMUpdateEventCoalescerEventType } from '../enum/EOIMUpdateEventCoalescerEventType';
import { OIMIndexManual } from './OIMIndexManual';
import { OIMIndexStoreMapDriven } from './OIMIndexStoreMapDriven';
import { TOIMPk } from '../types/TOIMPk';
import { OIMDBSettings } from '../const/OIMDBSettings';

/**
 * Base abstract coalescer that groups updates by keys and emits consolidated events.
 * Designed to be extended for different entity types (collections, indexes, etc.).
 */
export abstract class OIMUpdateEventCoalescer<TKey extends TOIMPk> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMUpdateEventCoalescerEventType.HAS_CHANGES]: void;
    }>();

    protected readonly updatedKeysIndex: OIMIndexManual<
        typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
        TKey
    >;
    private hasEmittedChanges = false;

    constructor(
        index?: OIMIndexManual<
            typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
            TKey
        >
    ) {
        this.updatedKeysIndex =
            index ??
            new OIMIndexManual<
                typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
                TKey
            >({
                store: new OIMIndexStoreMapDriven<
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
        this.updatedKeysIndex.setPks(OIMDBSettings.UPDATED_KEYS_INDEX_KEY, []);
        this.hasEmittedChanges = false;
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
