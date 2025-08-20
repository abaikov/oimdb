import { OIMDxDb } from './OIMDxDb';
import { OIMCollection } from '../core/OIMCollection';
import { OIMCollectionStoreMapDriven } from '../core/OIMCollectionStoreMapDriven';
import { OIMPkSelectorFactory } from '../core/OIMPkSelectorFactory';
import { OIMEntityUpdaterFactory } from '../core/OIMEntityUpdaterFactory';
import { OIMIndexManual } from '../core/OIMIndexManual';
import { OIMUpdateEventCoalescerCollection } from '../core/OIMUpdateEventCoalescerCollection';
import { OIMUpdateEventCoalescerIndex } from '../core/OIMUpdateEventCoalescerIndex';
import { OIMUpdateEventEmitter } from '../core/OIMUpdateEventEmitter';
import { OIMIndexComparatorFactory } from '../core/OIMIndexComparatorFactory';
import { TOIMSchedulerType } from '../types/TOIMSchedulerType';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';

/**
 * Create a database instance that manages shared event processing.
 * All collections and indexes created within this database share the same event queue. */
export function createDb(
    options: {
        scheduler?: TOIMSchedulerType;
    } = {}
) {
    const db = new OIMDxDb(options.scheduler);

    return {
        /**
         * Create a collection within this context (shares event queue)
         */
        createCollection<
            TEntity extends { id: TPk },
            TPk extends TOIMPk = string,
        >() {
            const collection = new OIMCollection<TEntity, TPk>({
                selectPk: new OIMPkSelectorFactory<
                    TEntity,
                    TPk
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TEntity, TPk>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TEntity>().createMergeEntityUpdater(),
            });

            const coalescer = new OIMUpdateEventCoalescerCollection(
                collection.emitter
            );
            const eventEmitter = new OIMUpdateEventEmitter({
                coalescer,
                queue: db.getEventQueue(),
            });

            return {
                // Simple API
                upsert: (entity: TEntity) => collection.upsertOne(entity),
                upsertMany: (entities: TEntity[]) =>
                    collection.upsertMany(entities),
                remove: (entity: TEntity) => collection.removeOne(entity),
                removeMany: (entities: TEntity[]) =>
                    collection.removeMany(entities),
                subscribe: (pk: TPk, handler: TOIMEventHandler<void>) =>
                    eventEmitter.subscribeOnKey(pk, handler),
                subscribeMany: (
                    pks: readonly TPk[],
                    handler: TOIMEventHandler<void>
                ) => eventEmitter.subscribeOnKeys(pks, handler),

                // Advanced access
                advanced: {
                    collection,
                    eventEmitter,
                    coalescer,
                    eventQueue: db.getEventQueue(),
                },

                // Cleanup
                destroy: () => {
                    eventEmitter.destroy();
                    coalescer.destroy();
                    collection.emitter.offAll();
                },
            };
        },

        /**
         * Create an index within this context (shares event queue)
         */
        createIndex<TIndexKey extends TOIMPk, TPk extends TOIMPk>(options?: {
            comparison?:
                | 'element-wise'
                | 'set-based'
                | 'always-update'
                | TOIMIndexComparator<TPk>;
        }) {
            // Set up comparator
            let comparePks: TOIMIndexComparator<TPk> | undefined;

            if (options?.comparison) {
                if (typeof options.comparison === 'function') {
                    comparePks = options.comparison;
                } else {
                    switch (options.comparison) {
                        case 'element-wise':
                            comparePks =
                                OIMIndexComparatorFactory.createElementWiseComparator<TPk>();
                            break;
                        case 'set-based':
                            comparePks =
                                OIMIndexComparatorFactory.createSetBasedComparator<TPk>();
                            break;
                        case 'always-update':
                            comparePks =
                                OIMIndexComparatorFactory.createAlwaysUpdateComparator<TPk>();
                            break;
                    }
                }
            }

            const index = new OIMIndexManual<TIndexKey, TPk>({ comparePks });
            const coalescer = new OIMUpdateEventCoalescerIndex(index.emitter);
            const eventEmitter = new OIMUpdateEventEmitter({
                coalescer,
                queue: db.getEventQueue(),
            });

            return {
                // Simple API
                set: (key: TIndexKey, pks: readonly TPk[]) =>
                    index.setPks(key, pks),
                add: (key: TIndexKey, pks: readonly TPk[]) =>
                    index.addPks(key, pks),
                remove: (key: TIndexKey, pks: readonly TPk[]) =>
                    index.removePks(key, pks),
                clear: (key?: TIndexKey) => index.clear(key),
                get: (key: TIndexKey) => index.getPks(key),
                has: (key: TIndexKey) => index.hasKey(key),
                keys: () => index.getKeys(),
                subscribe: (key: TIndexKey, handler: TOIMEventHandler<void>) =>
                    eventEmitter.subscribeOnKey(key, handler),
                subscribeMany: (
                    keys: readonly TIndexKey[],
                    handler: TOIMEventHandler<void>
                ) => eventEmitter.subscribeOnKeys(keys, handler),

                // Advanced access
                advanced: {
                    index,
                    eventEmitter,
                    coalescer,
                    queue: db.getEventQueue(),
                },

                // Cleanup
                destroy: () => {
                    eventEmitter.destroy();
                    coalescer.destroy();
                    index.destroy();
                },
            };
        },

        /**
         * Manually flush all pending events in the queue.
         * Useful for testing or when you want to force immediate processing.
         * Or if you din't use a scheduler, you can use this to flush the queue.
         */
        flushUpdatesNotifications() {
            db.getEventQueue().flush();
        },

        /**
         * Get metrics for this database
         */
        getMetrics() {
            return {
                queueLength: db.getEventQueue().length,
                scheduler: db.getScheduler().constructor.name,
            };
        },

        /**
         * Clean up the entire database
         */
        destroy() {
            db.destroy();
        },
    };
}
