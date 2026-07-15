import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

/**
 * Manual ordered Array-based index.
 *
 * Unlike generic Array-based indexes, this class is explicitly ordered:
 * - preserves order
 * - allows O(1) append (`push`)
 * - supports `move` and `removeAt` without computing diffs
 * - stores slots directly; collection-bound variants resolve PKs before writes
 *
 * It emits UPDATE events per key on every successful mutation. It is a plain
 * data structure: it knows nothing about "commands" — turning its mutations
 * into position-addressed commands is the command stream's job.
 */
export class OIMIndexManualOrderedArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexArrayBased<TKey, TPk> {
    public clear(key?: TKey): void {
        if (key === undefined) {
            const keys = this.getKeys();
            if (keys.length > 0) {
                this.store.clear();
                this.emitUpdate(Array.from(keys));
            }
            return;
        }
        if (this.store.getOneByKey(key) !== undefined) {
            this.store.removeOneByKey(key);
            this.emitUpdate([key]);
        }
    }

    public pushSlot(key: TKey, slot: TOIMAnyEntitySlot<TPk>): number {
        const list = this.getOrCreateList(key);
        const index = list.length;
        list.push(slot);
        this.emitUpdate([key]);
        return index;
    }

    public insertSlotAt(
        key: TKey,
        index: number,
        slot: TOIMAnyEntitySlot<TPk>
    ): number {
        const list = this.getOrCreateList(key);
        const safeIndex = Math.max(0, Math.min(index, list.length));
        list.splice(safeIndex, 0, slot);
        this.emitUpdate([key]);
        return safeIndex;
    }

    public removeAt(
        key: TKey,
        index: number
    ): TOIMAnyEntitySlot<TPk> | undefined {
        const list = this.store.getOneByKey(key);
        if (!list) return undefined;
        if (index < 0 || index >= list.length) return undefined;

        const [removed] = list.splice(index, 1);
        if (list.length === 0) {
            this.store.removeOneByKey(key);
        }
        this.emitUpdate([key]);
        return removed;
    }

    /**
     * Remove up to `count` consecutive slots starting at `index`.
     * Returns the number actually removed (clamped to bounds; 0 if nothing).
     */
    public removeRange(key: TKey, index: number, count: number): number {
        const list = this.store.getOneByKey(key);
        if (!list) return 0;
        if (index < 0 || index >= list.length || count <= 0) return 0;
        const actual = Math.min(count, list.length - index);
        list.splice(index, actual);
        if (list.length === 0) {
            this.store.removeOneByKey(key);
        }
        this.emitUpdate([key]);
        return actual;
    }

    public move(
        key: TKey,
        fromIndex: number,
        toIndex: number
    ): TOIMAnyEntitySlot<TPk> | undefined {
        const list = this.store.getOneByKey(key);
        if (!list) return undefined;
        if (fromIndex < 0 || fromIndex >= list.length) return undefined;
        if (toIndex < 0 || toIndex >= list.length) return undefined;
        if (fromIndex === toIndex) return list[fromIndex];

        const [slot] = list.splice(fromIndex, 1);
        if (slot === undefined) return undefined;
        list.splice(toIndex, 0, slot);
        this.emitUpdate([key]);
        return slot;
    }

    /** Replace the slot at `index` in place. Returns the safe index, or -1. */
    public setSlotAt(
        key: TKey,
        index: number,
        slot: TOIMAnyEntitySlot<TPk>
    ): number {
        const list = this.store.getOneByKey(key);
        if (!list) return -1;
        if (index < 0 || index >= list.length) return -1;
        list[index] = slot;
        this.emitUpdate([key]);
        return index;
    }

    /**
     * Move up to `count` consecutive slots from `from` to `to`. `to` is in the
     * coordinate space *after* the block is extracted (same as single `move`).
     * Returns the number actually moved (0 if a no-op / out of bounds).
     */
    public moveRange(
        key: TKey,
        from: number,
        to: number,
        count: number
    ): number {
        const list = this.store.getOneByKey(key);
        if (!list) return 0;
        if (from < 0 || from >= list.length || count <= 0) return 0;
        const actual = Math.min(count, list.length - from);
        const insertAt = Math.max(0, Math.min(to, list.length - actual));
        if (insertAt === from) return 0; // no-op
        const block = list.splice(from, actual);
        list.splice(insertAt, 0, ...block);
        this.emitUpdate([key]);
        return actual;
    }

    public resetSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        if (slots.length === 0) {
            if (this.store.getOneByKey(key) !== undefined) {
                this.store.removeOneByKey(key);
                this.emitUpdate([key]);
            }
            return;
        }
        this.store.setOneByKey(key, slots.slice());
        this.emitUpdate([key]);
    }

    private getOrCreateList(key: TKey): TOIMAnyEntitySlot<TPk>[] {
        let list = this.store.getOneByKey(key);
        if (!list) {
            list = [];
            this.store.setOneByKey(key, list);
        }
        return list;
    }
}
