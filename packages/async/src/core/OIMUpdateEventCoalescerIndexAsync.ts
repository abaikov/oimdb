import {
    OIMEventEmitter,
    EOIMIndexEventType,
    TOIMIndexUpdatePayload,
    TOIMPk,
    OIMDBSettings,
    EOIMUpdateEventCoalescerEventType,
} from '@oimdb/core';
import { OIMIndexManualAsync } from './OIMIndexManualAsync';
import { OIMIndexStoreMapDrivenAsync } from './OIMIndexStoreMapDrivenAsync';
import { IOIMCoalescerCompatible } from '../types/IOIMCoalescerCompatible';

/**
 * Async index-specific coalescer that tracks index key updates and emits consolidated change events.
 * Uses async index for storing updated keys.
 * Implements IOIMCoalescerCompatible for compatibility with OIMUpdateEventEmitter.
 */
export class OIMUpdateEventCoalescerIndexAsync<
    TIndexKey extends TOIMPk,
> implements IOIMCoalescerCompatible<TIndexKey> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMUpdateEventCoalescerEventType.HAS_CHANGES]: void;
    }>();

    protected readonly updatedKeysIndex: OIMIndexManualAsync<
        typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
        TIndexKey
    >;
    private hasEmittedChanges = false;
    // Synchronous cache for compatibility with OIMUpdateEventEmitter
    private updatedKeysCache = new Set<TIndexKey>();

    constructor(
        private readonly indexEmitter: OIMEventEmitter<{
            [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TIndexKey>;
        }>,
        index?: OIMIndexManualAsync<
            typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
            TIndexKey
        >
    ) {
        this.updatedKeysIndex =
            index ??
            new OIMIndexManualAsync<
                typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
                TIndexKey
            >({
                store: new OIMIndexStoreMapDrivenAsync<
                    typeof OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
                    TIndexKey
                >(),
            });
        this.indexEmitter.on(EOIMIndexEventType.UPDATE, this.handleUpdate);
        // Initialize the set if it doesn't exist
        this.initializeUpdatedKeys();
    }

    private async initializeUpdatedKeys(): Promise<void> {
        const hasKey = await this.updatedKeysIndex.hasKey(
            OIMDBSettings.UPDATED_KEYS_INDEX_KEY
        );
        if (!hasKey) {
            await this.updatedKeysIndex.setPks(
                OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
                []
            );
        }
    }

    /**
     * Get the set of keys that have been updated since last clear
     * Synchronous method for compatibility with OIMUpdateEventEmitter
     * Returns cached data
     */
    public getUpdatedKeys(): Set<TIndexKey> {
        return this.updatedKeysCache;
    }

    /**
     * Clear all updated keys and reset the changed state
     * Synchronous method for compatibility with OIMUpdateEventEmitter
     */
    public clearUpdatedKeys(): void {
        this.updatedKeysCache.clear();
        // Schedule async clear in background
        this.updatedKeysIndex.setPks(
            OIMDBSettings.UPDATED_KEYS_INDEX_KEY,
            []
        ).catch(() => {
            // Ignore errors in background operation
        });
        this.hasEmittedChanges = false;
    }

    /**
     * Add keys to the updated set and emit HAS_CHANGES event if needed
     */
    protected async addUpdatedKeys(keys: readonly TIndexKey[]): Promise<void> {
        // Update synchronous cache immediately
        for (const key of keys) {
            this.updatedKeysCache.add(key);
        }

        // Update async index in background
        await this.updatedKeysIndex.addPks(
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
     * When the index is updated, we keep track of the updated keys.
     */
    private handleUpdate = async (payload: TOIMIndexUpdatePayload<TIndexKey>) => {
        await this.addUpdatedKeys(payload.keys);
    };

    /**
     * Clean up event listeners when coalescer is no longer needed
     */
    public async destroy(): Promise<void> {
        this.indexEmitter.off(EOIMIndexEventType.UPDATE, this.handleUpdate);
        this.emitter.offAll();
        this.updatedKeysCache.clear();
        await this.updatedKeysIndex.destroy();
    }
}

