import { TOIMKey } from '../../../types/TOIMKey';
import { OIMEventQueue } from '../../../core/OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlot,
} from '../../../types/TOIMEntitySlot';
import { TOIMCollectionOrderedListCommandStreamOptions } from '../../../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMCollectionIndexManualOrderedArrayBased } from '../../../core/OIMCollectionIndexManualOrderedArrayBased';
import { OIMOrderedListCommandStream } from './OIMOrderedListCommandStream';

/**
 * Collection-bound ordered-list command stream.
 *
 * Public writes use PKs; they resolve to canonical collection slots (throwing on
 * an unresolvable pk) before mutating the index and recording the command.
 */
export class OIMCollectionOrderedListCommandStream<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
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
        const slot = this.resolvePk(pk);
        const index = this.index.pushSlot(key, slot);
        this.appendCommand(key, { type: 'insert', index, item: slot });
    }

    public insertAt(key: TKey, index: number, pk: TPk): void {
        const slot = this.resolvePk(pk);
        const safeIndex = this.index.insertSlotAt(key, index, slot);
        this.appendCommand(key, {
            type: 'insert',
            index: safeIndex,
            item: slot,
        });
    }

    /** Replace the element at `index` with the slot for `pk`, in place. */
    public setAt(key: TKey, index: number, pk: TPk): void {
        const slot = this.resolvePk(pk);
        const safeIndex = this.index.setSlotAt(key, index, slot);
        if (safeIndex < 0) return;
        this.appendCommand(key, {
            type: 'set',
            index: safeIndex,
            item: slot,
        });
    }

    public set(key: TKey, pks: readonly TPk[]): void {
        const slots = pks.map(pk => this.resolvePk(pk));
        this.index.resetSlots(key, slots);
        this.appendResetCommand(key, slots);
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
        return this.index.resolvePk(
            pk
        ) as TOIMAnyEntitySlot<TPk> as TOIMEntitySlot<TEntity, TPk>;
    }
}
