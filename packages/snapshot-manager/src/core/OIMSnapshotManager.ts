import {
    OIMReactiveCollection,
    EOIMCollectionEventType,
    TOIMCollectionUpdatePayload,
    TOIMEventHandler,
} from '@oimdb/core';
import {
    SnapshotData,
    EntitySnapshot,
    GetPkType,
    SnapshotManagerOptions,
    GetEntityType,
} from '../types/SnapshotTypes';

/**
 * Snapshot manager that tracks changes across multiple collections
 * and provides consolidated snapshots of all modifications.
 *
 * Subscribes directly to collection events (bypasses coalescing)
 * and tracks all primary keys that have been updated.
 */
export class OIMSnapshotManager<
    TCollections extends Record<
        string,
        OIMReactiveCollection<object, string | number>
    >,
> {
    private readonly collections: TCollections;
    private readonly options: Required<SnapshotManagerOptions>;

    // Track updated primary keys per collection
    private readonly updatedPks: {
        [K in keyof TCollections]: Set<GetPkType<TCollections[K]>>;
    };

    // Store unsubscribe functions for cleanup
    private readonly unsubscribeFunctions: Array<() => void> = [];

    constructor(
        collections: TCollections,
        options: SnapshotManagerOptions = {}
    ) {
        this.collections = collections;
        this.options = {
            includeEmptyCollections: options.includeEmptyCollections ?? true,
        };

        // Initialize updated PK tracking for each collection
        this.updatedPks = {} as Record<
            keyof TCollections,
            Set<GetPkType<TCollections[keyof TCollections]>>
        >;
        for (const collectionName in collections) {
            this.updatedPks[collectionName] = new Set();
        }

        // Subscribe to all collection events
        this.subscribeToCollections();
    }

    /**
     * Subscribe directly to collection update events (bypass coalescing)
     */
    private subscribeToCollections(): void {
        for (const [collectionName, collection] of Object.entries(
            this.collections
        )) {
            const handler: TOIMEventHandler<
                TOIMCollectionUpdatePayload<string | number>
            > = payload => {
                this.handleCollectionUpdate(
                    collectionName as keyof TCollections,
                    payload
                );
            };

            // Subscribe to collection emitter directly
            collection.collection.emitter.on(
                EOIMCollectionEventType.UPDATE,
                handler
            );

            // Store unsubscribe function
            const unsubscribe = () => {
                collection.collection.emitter.off(
                    EOIMCollectionEventType.UPDATE,
                    handler
                );
            };
            this.unsubscribeFunctions.push(unsubscribe);
        }
    }

    /**
     * Handle collection update events by tracking changed primary keys
     */
    private handleCollectionUpdate(
        collectionName: keyof TCollections,
        payload: TOIMCollectionUpdatePayload<string | number>
    ): void {
        const pkSet = this.updatedPks[collectionName];

        // Add all updated primary keys to the set (automatic deduplication)
        for (const pk of payload.pks) {
            pkSet.add(pk as GetPkType<TCollections[keyof TCollections]>);
        }
    }

    /**
     * Take a snapshot of all changes and clear internal state
     *
     * @returns Snapshot containing all changed entities across collections
     */
    public takeSnapshot(): SnapshotData<TCollections> {
        const snapshot = {} as SnapshotData<TCollections>;

        for (const [collectionName, collection] of Object.entries(
            this.collections
        )) {
            const typedCollectionName = collectionName as keyof TCollections;
            const updatedPkSet = this.updatedPks[typedCollectionName];

            // Create snapshots for all updated entities
            const entitySnapshots: Array<
                EntitySnapshot<object, string | number>
            > = [];

            for (const pk of Array.from(updatedPkSet)) {
                const entity = collection.getOneByPk(pk);
                entitySnapshots.push({
                    pk,
                    entity: entity || null, // null if entity was deleted
                });
            }

            // Include collection in snapshot if it has changes or if includeEmptyCollections is true
            if (
                entitySnapshots.length > 0 ||
                this.options.includeEmptyCollections
            ) {
                snapshot[typedCollectionName] = entitySnapshots as Array<
                    EntitySnapshot<
                        GetEntityType<TCollections[keyof TCollections]>,
                        GetPkType<TCollections[keyof TCollections]>
                    >
                >;
            }
        }

        // Clear all tracked changes after taking snapshot
        this.clearTrackedChanges();

        return snapshot;
    }

    /**
     * Clear all tracked primary key changes
     */
    private clearTrackedChanges(): void {
        for (const collectionName in this.updatedPks) {
            this.updatedPks[collectionName].clear();
        }
    }

    /**
     * Get current count of tracked changes without clearing them
     * Useful for debugging or monitoring
     */
    public getChangeCount(): { [K in keyof TCollections]: number } {
        const counts = {} as { [K in keyof TCollections]: number };

        for (const collectionName in this.updatedPks) {
            counts[collectionName] = this.updatedPks[collectionName].size;
        }

        return counts;
    }

    /**
     * Check if there are any tracked changes
     */
    public hasChanges(): boolean {
        for (const collectionName in this.updatedPks) {
            if (this.updatedPks[collectionName].size > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Manually clear all tracked changes without taking a snapshot
     */
    public clearChanges(): void {
        this.clearTrackedChanges();
    }

    /**
     * Clean up all subscriptions and resources
     * Call this when the snapshot manager is no longer needed
     */
    public destroy(): void {
        // Unsubscribe from all collection events
        for (const unsubscribe of this.unsubscribeFunctions) {
            unsubscribe();
        }
        this.unsubscribeFunctions.length = 0;

        // Clear all tracked changes
        this.clearTrackedChanges();
    }
}
