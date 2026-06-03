import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import {
    TOIMDerivedCollectionIndexArrayBasedOptions,
    TOIMDerivedEntityComparator,
    TOIMDerivedEntityOrderSelector,
    TOIMDerivedIndexKeySelector,
} from '../types/TOIMCollectionIndexOptions';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';
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
    TKey extends TOIMPk,
    TPk extends TOIMPk,
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
        super.clear();

        const slotsByKey = new Map<TKey, TOIMEntitySlot<TEntity, TPk>[]>();
        const slots = this.collection.getAllSlots();

        for (const slot of slots) {
            if (slot.item === undefined) continue;
            const keys = this.normalizeKeys(this.selectIndexKeys(slot.item));
            if (keys.length === 0) continue;

            this.keysByPk.set(slot.pk, new Set(keys));
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
        super.destroy();
    }

    private readonly onCollectionUpdate = (pks: readonly TPk[]): void => {
        if (pks.length === 0) {
            this.rebuildFromCollection();
            return;
        }

        const affectedKeys = new Set<TKey>();
        for (const pk of pks) {
            this.trackPkKeys(pk, affectedKeys);
        }
        for (const key of affectedKeys) {
            this.rebuildKey(key);
        }
    };

    private trackPkKeys(pk: TPk, affectedKeys: Set<TKey>): void {
        const prevKeys = this.keysByPk.get(pk) ?? new Set<TKey>();
        for (const key of prevKeys) affectedKeys.add(key);

        const slot = this.collection.getSlotByPk(pk);
        const entity = slot?.item;
        const nextKeys =
            entity === undefined
                ? new Set<TKey>()
                : new Set(this.normalizeKeys(this.selectIndexKeys(entity)));

        for (const key of nextKeys) affectedKeys.add(key);

        if (nextKeys.size === 0) {
            this.keysByPk.delete(pk);
        } else {
            this.keysByPk.set(pk, nextKeys);
        }
    }

    private rebuildKey(key: TKey): void {
        const keySlots: TOIMEntitySlot<TEntity, TPk>[] = [];
        const slots = this.collection.getAllSlots();

        for (const slot of slots) {
            if (slot.item === undefined) continue;
            const keys = this.keysByPk.get(slot.pk);
            if (keys?.has(key)) keySlots.push(slot);
        }

        if (keySlots.length === 0) {
            super.clear(key);
        } else {
            this.setSlots(key, this.sortSlots(keySlots));
        }
    }

    private sortSlots(
        slots: TOIMEntitySlot<TEntity, TPk>[]
    ): TOIMEntitySlot<TEntity, TPk>[] {
        if (!this.compareEntities && !this.orderBy) return slots;

        return slots.slice().sort((a, b) => {
            const aItem = a.item;
            const bItem = b.item;
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
