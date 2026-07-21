import { TOIMKey } from '../types/TOIMKey';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import {
    TOIMDerivedCollectionIndexArrayBasedOptions,
    TOIMDerivedEntityComparator,
    TOIMDerivedEntityOrderSelector,
    TOIMDerivedEntityOrderValue,
    TOIMDerivedIndexKeySelector,
} from '../types/TOIMCollectionIndexOptions';
import { TOIMAnyEntitySlot, TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMReactiveCollectionIndexManualArrayBased } from './OIMReactiveCollectionIndexManualArrayBased';

/**
 * Collection-bound Array-based index derived from entity data.
 *
 * It maintains ordered per-key arrays automatically from collection updates.
 * Use `orderBy` or `compareEntities` when list order matters.
 */
export class OIMDerivedCollectionIndexArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveCollectionIndexManualArrayBased<TKey, TPk, TEntity> {
    private readonly collection: OIMReactiveCollection<TEntity, TPk>;
    private readonly selectIndexKeys: TOIMDerivedIndexKeySelector<
        TEntity,
        TKey
    >;
    private readonly compareEntities?: TOIMDerivedEntityComparator<TEntity>;
    private readonly orderBy?: TOIMDerivedEntityOrderSelector<TEntity>;
    private readonly unsubscribeFromCollection: () => void;
    private readonly keysByPk = new Map<TPk, Set<TKey>>();
    // Last known sort value per pk (only when `orderBy` is used), so an update
    // touching an unrelated field can skip re-sorting when the value is unchanged.
    private readonly orderValueByPk = new Map<TPk, TOIMDerivedEntityOrderValue>();

    constructor(
        queue: OIMEventQueue,
        collection: OIMReactiveCollection<TEntity, TPk>,
        opts: TOIMDerivedCollectionIndexArrayBasedOptions<TEntity, TKey, TPk>
    ) {
        super(queue, {
            collection,
            indexOptions: opts.indexOptions,
        });
        this.collection = collection;
        this.selectIndexKeys = opts.selectIndexKeys;
        this.compareEntities = opts.compareEntities;
        this.orderBy = opts.orderBy;
        this.unsubscribeFromCollection = collection.emitter.on(
            EOIMCollectionEventType.UPDATE,
            payload => this.onCollectionUpdate(payload.pks)
        );

        if (opts.buildInitial !== false) {
            this.rebuildFromCollection();
        }
    }

    public rebuildFromCollection(): void {
        this.keysByPk.clear();
        this.orderValueByPk.clear();
        super.clear();

        const slotsByKey = new Map<TKey, TOIMEntitySlot<TEntity, TPk>[]>();
        const slots = this.collection.getAllSlots();

        for (const slot of slots) {
            if (slot.item === undefined) continue;
            const keys = this.normalizeKeys(this.selectIndexKeys(slot.item));
            if (keys.length === 0) continue;

            this.keysByPk.set(slot.pk, new Set(keys));
            if (this.orderBy) {
                this.orderValueByPk.set(slot.pk, this.orderBy(slot.item));
            }
            for (const key of keys) {
                let slotsForKey = slotsByKey.get(key);
                if (!slotsForKey) {
                    slotsForKey = [];
                    slotsByKey.set(key, slotsForKey);
                }
                slotsForKey.push(slot);
            }
        }

        for (const [key, keySlots] of slotsByKey) {
            this.setSlots(key, this.sortSlots(keySlots));
        }
    }

    public override clear(key?: TKey): void {
        if (key === undefined) {
            this.keysByPk.clear();
            this.orderValueByPk.clear();
        } else {
            for (const keys of this.keysByPk.values()) {
                keys.delete(key);
            }
        }
        super.clear(key);
    }

    public override destroy(): void {
        this.unsubscribeFromCollection();
        this.keysByPk.clear();
        this.orderValueByPk.clear();
        super.destroy();
    }

    private readonly onCollectionUpdate = (pks: readonly TPk[]): void => {
        if (pks.length === 0) {
            this.rebuildFromCollection();
            return;
        }

        const ordered = !!(this.compareEntities || this.orderBy);
        // Keys whose bucket order must be recomputed (membership add or a moved
        // sort position). Removal-only keys keep their order, so they are not here.
        const keysToSort = ordered ? new Set<TKey>() : null;

        for (const pk of pks) {
            const prevKeys = this.keysByPk.get(pk) ?? new Set<TKey>();
            const slot = this.collection.getSlotByPk(pk);
            const entity = slot?.item;
            const nextKeys =
                entity === undefined
                    ? new Set<TKey>()
                    : new Set(this.normalizeKeys(this.selectIndexKeys(entity)));

            // Did this entity's sort position possibly change?
            let orderChanged = false;
            if (this.orderBy) {
                if (entity === undefined || nextKeys.size === 0) {
                    this.orderValueByPk.delete(pk);
                } else {
                    const value = this.orderBy(entity);
                    orderChanged =
                        !this.orderValueByPk.has(pk) ||
                        this.orderValueByPk.get(pk) !== value;
                    this.orderValueByPk.set(pk, value);
                }
            } else if (this.compareEntities && entity !== undefined) {
                // A custom comparator may depend on any field — be conservative.
                orderChanged = true;
            }

            // Removed keys: drop membership; order of the remaining slots is kept.
            for (const key of prevKeys) {
                if (!nextKeys.has(key)) this.removePks(key, [pk]);
            }

            // Added / retained keys.
            if (entity !== undefined) {
                for (const key of nextKeys) {
                    if (!prevKeys.has(key)) {
                        this.addPks(key, [pk]); // new member needs ordering
                        keysToSort?.add(key);
                    } else if (orderChanged) {
                        keysToSort?.add(key); // same member, position moved
                    }
                }
            }

            if (nextKeys.size === 0) this.keysByPk.delete(pk);
            else this.keysByPk.set(pk, nextKeys);
        }

        // Re-sort only the touched buckets, reading each bucket's own slots
        // (O(bucket)) rather than scanning the whole collection per key.
        if (keysToSort) {
            for (const key of keysToSort) {
                this.setSlots(
                    key,
                    this.sortSlots(this.index.getSlotsByKey(key))
                );
            }
        }
    };

    private sortSlots(
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): TOIMAnyEntitySlot<TPk>[] {
        if (!this.compareEntities && !this.orderBy) return slots.slice();

        return slots.slice().sort((a, b) => {
            const aItem = a.item as TEntity | undefined;
            const bItem = b.item as TEntity | undefined;
            if (aItem === undefined || bItem === undefined) return 0;
            if (this.compareEntities) {
                return this.compareEntities(aItem, bItem);
            }

            const aValue = this.orderBy!(aItem);
            const bValue = this.orderBy!(bItem);
            if (aValue < bValue) return -1;
            if (aValue > bValue) return 1;
            return 0;
        });
    }

    private normalizeKeys(
        keys: TKey | readonly TKey[] | undefined | null
    ): TKey[] {
        if (keys === undefined || keys === null) return [];
        const rawKeys = Array.isArray(keys) ? keys : [keys];
        const result: TKey[] = [];
        const seen = new Set<TKey>();
        for (const key of rawKeys) {
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(key);
        }
        return result;
    }
}
