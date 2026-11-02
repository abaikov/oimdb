import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlot } from './types/TOIMColumnSlot';
import type { TOIMColumnSlotOrdinalStoreServiceOptions } from './types/TOIMColumnSlotOrdinalStoreServiceOptions';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';

type TOIMColumnSlotOrdinalStore<TColumnSlot> = {
    readonly columnSlots: (TColumnSlot | undefined)[];
    slotCount: number;
};

export class OIMColumnSlotOrdinalStoreService<TColumnSlot extends TOIMKeyedSlot<string> = TOIMColumnSlot>
implements IOIMSlotStoreService<string, TColumnSlot, TOIMColumnSlotOrdinalStore<TColumnSlot>> {
    private readonly ordinalsByColumnKey: ReadonlyMap<string, number>;

    public constructor(options: TOIMColumnSlotOrdinalStoreServiceOptions) {
        const ordinalsByColumnKey = new Map<string, number>();
        for (const columnName of options.columnNames) {
            if (!ordinalsByColumnKey.has(columnName)) ordinalsByColumnKey.set(columnName, ordinalsByColumnKey.size);
        }
        const declaredColumnCount = ordinalsByColumnKey.size;
        ordinalsByColumnKey.set(OIM_ANY_COLUMN_KEY, declaredColumnCount);
        const columnGroups = options.columnGroups;
        for (let i = 0; i < columnGroups.length; i++) {
            const columnGroup = columnGroups[i];
            for (const columnName of columnGroup.columnNames) {
                const ordinal = ordinalsByColumnKey.get(columnName);
                if (ordinal !== undefined && ordinal < declaredColumnCount) continue;
                throw new Error(
                    `OIMColumnSlotOrdinalStoreService: the column "${columnName}" of a column group is not among the columns `
                    + 'this collection was created with. Name it in `columnNames`.',
                );
            }
            if (!ordinalsByColumnKey.has(columnGroup.key)) ordinalsByColumnKey.set(columnGroup.key, ordinalsByColumnKey.size);
        }
        this.ordinalsByColumnKey = ordinalsByColumnKey;
    }

    public createStore(): TOIMColumnSlotOrdinalStore<TColumnSlot> { return { columnSlots: [], slotCount: 0 }; }

    public ownKey<TOwnedKey extends string>(key: TOwnedKey): TOwnedKey { return key; }

    public isSameKey(key: string, otherKey: string): boolean { return key === otherKey; }

    public get(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, key: string): TColumnSlot | undefined {
        const ordinal = this.ordinalsByColumnKey.get(key);
        return ordinal === undefined ? undefined : store.columnSlots[ordinal];
    }

    public set(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, slot: TColumnSlot): void {
        const key = slot.key;
        const ordinal = this.ordinalsByColumnKey.get(key);
        if (ordinal === undefined) {
            throw new Error(
                `OIMColumnSlotOrdinalStoreService: the column "${key}" is not among the columns `
                + 'this collection was created with, so no slot can be filed for it. Name it in `columnNames`.',
            );
        }
        const columnSlots = store.columnSlots;
        if (columnSlots[ordinal] === undefined) store.slotCount++;
        columnSlots[ordinal] = slot;
    }

    public delete(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, slot: TColumnSlot): void {
        const ordinal = this.ordinalsByColumnKey.get(slot.key);
        if (ordinal === undefined) return;
        const columnSlots = store.columnSlots;
        if (columnSlots[ordinal] === undefined) return;
        columnSlots[ordinal] = undefined;
        store.slotCount--;
    }

    public *getSlots(store: TOIMColumnSlotOrdinalStore<TColumnSlot>): IterableIterator<TColumnSlot> {
        const columnSlots = store.columnSlots;
        for (let i = 0; i < columnSlots.length; i++) {
            const columnSlot = columnSlots[i];
            if (columnSlot !== undefined) yield columnSlot;
        }
    }

    public getSlotCount(store: TOIMColumnSlotOrdinalStore<TColumnSlot>): number {
        return store.slotCount;
    }
}
