import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMEntitySlot } from '../../../types/TOIMEntitySlot';
import { OIMOrderedListCommandBuffer } from '../../../abstract/OIMOrderedListCommandBuffer';
import { OIMIndexManualOrderedArrayBased } from '../../../core/OIMIndexManualOrderedArrayBased';

/**
 * Slot-first ordered-list command stream.
 *
 * Emits position-addressed commands whose `item` is the entity slot, driven by
 * its own writer methods (`pushSlot`, `move`, `removeAt`, …) — each mutates the
 * backing ordered index and records the matching command. Write through the
 * stream (not the index directly) to have your edits recorded. For PK writes
 * bound to a collection, use `OIMCollectionOrderedListCommandStream`; to derive
 * commands from an existing reactive index instead of writing them, use
 * `OIMOrderedListCommandStreamDiffDriven`.
 *
 * Command buffering, `after_flush` delivery and the consume/subscribe surface
 * come from {@link OIMOrderedListCommandBuffer}.
 */
export class OIMOrderedListCommandStream<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object = object,
> extends OIMOrderedListCommandBuffer<TKey, TOIMEntitySlot<TEntity, TPk>> {
    /** Underlying slot-first ordered index. */
    public readonly index: OIMIndexManualOrderedArrayBased<TKey, TPk>;

    constructor(
        queue: OIMEventQueue,
        index?: OIMIndexManualOrderedArrayBased<TKey, TPk>
    ) {
        super(queue);
        this.index =
            index ?? new OIMIndexManualOrderedArrayBased<TKey, TPk>();
    }

    public getPksByKey(key: TKey): readonly TPk[] {
        return this.index.getPksByKey(key);
    }

    public getSlotsByKey(
        key: TKey
    ): readonly TOIMEntitySlot<TEntity, TPk>[] {
        return this.index.getSlotsByKey(
            key
        ) as readonly TOIMEntitySlot<TEntity, TPk>[];
    }

    /** {@link OIMOrderedListCommandBuffer.getItemsByKey} — the slots in order. */
    public getItemsByKey(
        key: TKey
    ): readonly TOIMEntitySlot<TEntity, TPk>[] {
        return this.getSlotsByKey(key);
    }

    public getEntitiesByKey(key: TKey): (TEntity | undefined)[] {
        return this.index.getEntitiesByKey<TEntity>(key);
    }

    public hasKey(key: TKey): boolean {
        return this.index.hasKey(key);
    }

    public getKeys(): readonly TKey[] {
        return this.index.getKeys();
    }

    public pushSlot(key: TKey, slot: TOIMEntitySlot<TEntity, TPk>): void {
        const index = this.index.pushSlot(key, slot);
        this.appendCommand(key, { type: 'insert', index, item: slot });
    }

    public insertSlotAt(
        key: TKey,
        index: number,
        slot: TOIMEntitySlot<TEntity, TPk>
    ): void {
        const safeIndex = this.index.insertSlotAt(key, index, slot);
        this.appendCommand(key, {
            type: 'insert',
            index: safeIndex,
            item: slot,
        });
    }

    /** Replace the slot at `index` in place. */
    public setSlotAt(
        key: TKey,
        index: number,
        slot: TOIMEntitySlot<TEntity, TPk>
    ): void {
        const safeIndex = this.index.setSlotAt(key, index, slot);
        if (safeIndex < 0) return;
        this.appendCommand(key, {
            type: 'set',
            index: safeIndex,
            item: slot,
        });
    }

    public removeAt(key: TKey, index: number): void {
        const slot = this.index.removeAt(key, index);
        if (slot === undefined) return;
        this.appendCommand(key, { type: 'remove', index });
    }

    /** Remove `count` consecutive elements from `index`; emits `remove` with `count`. */
    public removeRange(key: TKey, index: number, count: number): void {
        const removed = this.index.removeRange(key, index, count);
        if (removed <= 0) return;
        this.appendCommand(key, { type: 'remove', index, count: removed });
    }

    public move(key: TKey, fromIndex: number, toIndex: number): void {
        // A no-op move mutates nothing and records nothing (the index would
        // return the slot unchanged, so guard here rather than emit a phantom).
        if (fromIndex === toIndex) return;
        const slot = this.index.move(key, fromIndex, toIndex);
        if (slot === undefined) return;
        this.appendCommand(key, {
            type: 'move',
            from: fromIndex,
            to: toIndex,
        });
    }

    /**
     * Move `count` consecutive elements from `from` to `to`; emits `move` with
     * `count`. `to` is in the post-extraction coordinate space (as single `move`).
     */
    public moveRange(
        key: TKey,
        from: number,
        to: number,
        count: number
    ): void {
        const moved = this.index.moveRange(key, from, to, count);
        if (moved <= 0) return;
        this.appendCommand(key, { type: 'move', from, to, count: moved });
    }

    public setSlots(
        key: TKey,
        slots: readonly TOIMEntitySlot<TEntity, TPk>[]
    ): void {
        this.index.resetSlots(key, slots);
        this.appendResetCommand(key, slots);
    }

    public clear(key?: TKey): void {
        if (key === undefined) {
            // Capture keys BEFORE clearing, then emit one reset([]) per key so
            // command consumers tear each list down.
            const keys = this.getKeys().slice();
            if (keys.length === 0) return;
            this.index.clear();
            for (let i = 0; i < keys.length; i++) {
                this.appendResetCommand(keys[i], []);
            }
            return;
        }
        if (!this.index.hasKey(key)) return;
        this.index.clear(key);
        this.appendResetCommand(key, []);
    }

    public override destroy(): void {
        this.index.destroy();
        super.destroy();
    }
}
