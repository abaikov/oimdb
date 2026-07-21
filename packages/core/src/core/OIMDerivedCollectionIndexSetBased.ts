import { TOIMKey } from '../types/TOIMKey';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMReactiveCollectionIndexManualSetBased } from './OIMReactiveCollectionIndexManualSetBased';
import {
    TOIMDerivedCollectionIndexSetBasedOptions,
    TOIMDerivedIndexKeySelector,
} from '../types/TOIMCollectionIndexOptions';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Collection-bound Set-based index derived from entity data.
 *
 * The collection remains the source of truth. This index listens to collection
 * updates and maintains key membership automatically.
 */
export class OIMDerivedCollectionIndexSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveCollectionIndexManualSetBased<TKey, TPk, TEntity> {
    private readonly collection: OIMReactiveCollection<TEntity, TPk>;
    private readonly selectIndexKeys: TOIMDerivedIndexKeySelector<
        TEntity,
        TKey
    >;
    private readonly unsubscribeFromCollection: () => void;
    private readonly keysByPk = new Map<TPk, Set<TKey>>();

    constructor(
        queue: OIMEventQueue,
        collection: OIMReactiveCollection<TEntity, TPk>,
        opts: TOIMDerivedCollectionIndexSetBasedOptions<TEntity, TKey, TPk>
    ) {
        super(queue, {
            collection,
            indexOptions: opts.indexOptions,
        });
        this.collection = collection;
        this.selectIndexKeys = opts.selectIndexKeys;
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

        const slotsByKey = new Map<TKey, Set<TOIMEntitySlot<TEntity, TPk>>>();
        const slots = this.collection.getAllSlots();

        for (const slot of slots) {
            if (slot.item === undefined) continue;
            const keys = this.normalizeKeys(this.selectIndexKeys(slot.item));
            if (keys.length === 0) continue;

            this.keysByPk.set(slot.pk, new Set(keys));
            for (const key of keys) {
                let slotsForKey = slotsByKey.get(key);
                if (!slotsForKey) {
                    slotsForKey = new Set();
                    slotsByKey.set(key, slotsForKey);
                }
                slotsForKey.add(slot);
            }
        }

        for (const [key, keySlots] of slotsByKey) {
            this.setSlots(key, keySlots);
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

        for (const pk of pks) {
            this.syncPk(pk);
        }
    };

    private syncPk(pk: TPk): void {
        const prevKeys = this.keysByPk.get(pk) ?? new Set<TKey>();
        const slot = this.collection.getSlotByPk(pk);
        const entity = slot?.item;
        const nextKeys =
            entity === undefined
                ? new Set<TKey>()
                : new Set(this.normalizeKeys(this.selectIndexKeys(entity)));

        for (const key of prevKeys) {
            if (!nextKeys.has(key)) {
                this.removePks(key, [pk]);
            }
        }

        if (entity !== undefined) {
            for (const key of nextKeys) {
                if (!prevKeys.has(key)) {
                    this.addPks(key, [pk]);
                }
            }
        }

        if (nextKeys.size === 0) {
            this.keysByPk.delete(pk);
        } else {
            this.keysByPk.set(pk, nextKeys);
        }
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
