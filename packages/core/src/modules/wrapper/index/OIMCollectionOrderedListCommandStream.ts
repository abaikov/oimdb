import { OIMEventQueue } from '../../../core/OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlot,
} from '../../../types/TOIMEntitySlot';
import { TOIMCollectionOrderedListCommandStreamOptions } from '../../../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMCollectionIndexManualOrderedArrayBased } from './OIMCollectionIndexManualOrderedArrayBased';
import { OIMOrderedListCommandStream } from './OIMOrderedListCommandStream';

/**
 * Collection-bound ordered-list command stream.
 *
 * Public writes use PKs, internally they resolve to canonical collection slots.
 */
export class OIMCollectionOrderedListCommandStream<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object = object,
> extends OIMOrderedListCommandStream<TKey, TPk, TEntity> {
    public override readonly index: OIMCollectionIndexManualOrderedArrayBased<
        TKey,
        TPk,
        TEntity
    >;

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionOrderedListCommandStreamOptions<
            TKey,
            TPk,
            TEntity
        >
    ) {
        const index =
            opts.index ??
            new OIMCollectionIndexManualOrderedArrayBased<TKey, TPk, TEntity>(
                opts.collection !== undefined
                    ? { collection: opts.collection }
                    : { resolveSlot: opts.resolveSlot }
            );
        super(queue, index);
        this.index = index;
    }

    public push(key: TKey, pk: TPk): void {
        this.withWrite(() => {
            const slot = this.resolvePk(pk);
            const index = this.index.pushSlot(key, slot);
            this.appendCommand(key, {
                type: 'insert',
                pk,
                slot,
                index,
            });
        });
    }

    public insertAt(key: TKey, index: number, pk: TPk): void {
        this.withWrite(() => {
            const slot = this.resolvePk(pk);
            const safeIndex = this.index.insertSlotAt(key, index, slot);
            this.appendCommand(key, {
                type: 'insert',
                pk,
                slot,
                index: safeIndex,
            });
        });
    }

    public set(key: TKey, pks: readonly TPk[]): void {
        this.withWrite(() => {
            const slots = pks.map(pk => this.resolvePk(pk));
            this.index.resetSlots(key, slots);
            this.appendSetCommand(key, slots);
        });
    }

    public override getSlotsByKey(
        key: TKey
    ): readonly TOIMEntitySlot<TEntity, TPk>[] {
        return this.index.getSlotsByKey(
            key
        ) as readonly TOIMEntitySlot<TEntity, TPk>[];
    }

    public override getEntitiesByKey(key: TKey): (TEntity | undefined)[] {
        return this.index.getEntitiesByKey(key);
    }

    private resolvePk(pk: TPk): TOIMEntitySlot<TEntity, TPk> {
        return this.index.resolvePk(pk) as TOIMAnyEntitySlot<TPk> as TOIMEntitySlot<
            TEntity,
            TPk
        >;
    }
}
