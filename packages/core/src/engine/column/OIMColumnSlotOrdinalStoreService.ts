import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlot } from './types/TOIMColumnSlot';
import type { TOIMColumnSlotOrdinalStoreServiceOptions } from './types/TOIMColumnSlotOrdinalStoreServiceOptions';
import { oimColumnNamesOfKey } from './utils/oimColumnNamesOfKey';

type TOIMColumnSlotOrdinalStore<TColumnSlot> = {
    readonly columnSlots: (TColumnSlot | undefined)[];
    slotCount: number;
};

export class OIMColumnSlotOrdinalStoreService<TColumnSlot extends TOIMKeyedSlot<string> = TOIMColumnSlot>
implements IOIMSlotStoreService<string, TColumnSlot, TOIMColumnSlotOrdinalStore<TColumnSlot>> {
    private readonly ordinalsByColumnName = new Map<string, number>();

    private readonly declaredColumnNames: ReadonlySet<string>;

    public constructor(options: TOIMColumnSlotOrdinalStoreServiceOptions) {
        this.declaredColumnNames = new Set(options.columnNames);
        for (const columnName of this.declaredColumnNames) {
            this.ordinalsByColumnName.set(columnName, this.ordinalsByColumnName.size);
        }
    }

    public createStore(): TOIMColumnSlotOrdinalStore<TColumnSlot> { return { columnSlots: [], slotCount: 0 }; }

    public ownKey<TOwnedKey extends string>(key: TOwnedKey): TOwnedKey { return key; }

    public isSameKey(key: string, otherKey: string): boolean { return key === otherKey; }

    public get(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, key: string): TColumnSlot | undefined {
        const ordinal = this.ordinalsByColumnName.get(key);
        return ordinal === undefined ? undefined : store.columnSlots[ordinal];
    }

    public set(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, key: string, slot: TColumnSlot): void {
        const ordinal = this.ordinalsByColumnName.get(key) ?? this.assignColumnGroupOrdinal(key);
        const columnSlots = store.columnSlots;
        if (columnSlots[ordinal] === undefined) store.slotCount++;
        columnSlots[ordinal] = slot;
    }

    public remove(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, key: string): void {
        const ordinal = this.ordinalsByColumnName.get(key);
        if (ordinal === undefined) return;
        const columnSlots = store.columnSlots;
        if (columnSlots[ordinal] === undefined) return;
        columnSlots[ordinal] = undefined;
        store.slotCount--;
    }

    public fileSlot(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, slot: TColumnSlot): void {
        this.set(store, slot.key, slot);
    }

    public unfileSlot(store: TOIMColumnSlotOrdinalStore<TColumnSlot>, slot: TColumnSlot): void {
        this.remove(store, slot.key);
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

    private assignColumnGroupOrdinal(key: string): number {
        const columnNames = oimColumnNamesOfKey(key);
        for (let i = 0; i < columnNames.length; i++) {
            if (this.declaredColumnNames.has(columnNames[i])) continue;
            throw new Error(
                `OIMColumnSlotOrdinalStoreService: the column "${columnNames[i]}" is not among the columns ` +
                'this collection was created with, so no slot can be filed for it. Name it in `columns`.',
            );
        }
        const ordinal = this.ordinalsByColumnName.size;
        this.ordinalsByColumnName.set(key, ordinal);
        return ordinal;
    }
}
