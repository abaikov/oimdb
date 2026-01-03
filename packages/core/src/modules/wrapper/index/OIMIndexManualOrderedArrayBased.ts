import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { TOIMPk } from '../../../type/TOIMPk';

/**
 * Manual ordered Array-based index.
 *
 * Unlike `OIMIndexManualArrayBased.addPks/removePks`, this class is explicitly ordered:
 * - preserves order
 * - allows O(1) append (`push`)
 * - supports `move` and `removeAt` without computing diffs
 *
 * It emits UPDATE events per key on every successful mutation.
 */
export class OIMIndexManualOrderedArrayBased<
    TKey extends TOIMPk,
    TItemKey extends TOIMPk,
> extends OIMIndexArrayBased<TKey, TItemKey> {
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

    public push(key: TKey, itemKey: TItemKey): number {
        const list = this.getOrCreateList(key);
        const index = list.length;
        list.push(itemKey);
        this.emitUpdate([key]);
        return index;
    }

    public insertAt(key: TKey, index: number, itemKey: TItemKey): void {
        const list = this.getOrCreateList(key);
        const safeIndex = Math.max(0, Math.min(index, list.length));
        list.splice(safeIndex, 0, itemKey);
        this.emitUpdate([key]);
    }

    public removeAt(key: TKey, index: number): TItemKey | undefined {
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

    public move(
        key: TKey,
        fromIndex: number,
        toIndex: number
    ): TItemKey | undefined {
        const list = this.store.getOneByKey(key);
        if (!list) return undefined;
        if (fromIndex < 0 || fromIndex >= list.length) return undefined;
        if (toIndex < 0 || toIndex >= list.length) return undefined;
        if (fromIndex === toIndex) return list[fromIndex];

        const [itemKey] = list.splice(fromIndex, 1);
        if (itemKey === undefined) return undefined;
        list.splice(toIndex, 0, itemKey);
        this.emitUpdate([key]);
        return itemKey;
    }

    public reset(key: TKey, itemKeys: readonly TItemKey[]): void {
        if (itemKeys.length === 0) {
            if (this.store.getOneByKey(key) !== undefined) {
                this.store.removeOneByKey(key);
                this.emitUpdate([key]);
            }
            return;
        }
        this.store.setOneByKey(key, Array.from(itemKeys));
        this.emitUpdate([key]);
    }

    private getOrCreateList(key: TKey): TItemKey[] {
        let list = this.store.getOneByKey(key);
        if (!list) {
            list = [];
            this.store.setOneByKey(key, list);
        }
        return list;
    }
}
