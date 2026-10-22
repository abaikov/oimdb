import type { TOIMColumnGroup } from './types/TOIMColumnGroup';
import type { TOIMColumnReaders } from './types/TOIMColumnReaders';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import { OIMSlotOwner } from '../slot/OIMSlotOwner';
import type { TOIMUnusedSlotCollectorSlot } from '../collector/types/TOIMUnusedSlotCollectorSlot';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import type { TOIMSlotEditable } from '../slot/types/TOIMSlotEditable';
import { oimColumnGroupKeyOfColumnNames } from './utils/oimColumnGroupKeyOfColumnNames';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';
import { OIM_COLUMN_GROUP_KEY_SEPARATOR } from './constants/OIM_COLUMN_GROUP_KEY_SEPARATOR';
import { oimColumnNamesOfKey } from './utils/oimColumnNamesOfKey';
import { oimMarkSlotReleased } from '../slot/utils/oimMarkSlotReleased';

export abstract class OIMColumnOwner<
    TCarrierSlot extends TOIMSlot, TColumnSlot extends TOIMKeyedSlot<string>,
> extends OIMSlotOwner {
    protected readonly columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>;

    protected constructor(columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>) {
        super();
        this.columnSlotStoreService = columnSlotStoreService;
    }

    protected abstract createColumnSlot(carrierSlot: TCarrierSlot, key: string): TColumnSlot;

    protected abstract carrierSlotOf(columnSlot: TColumnSlot): TCarrierSlot;

    public getColumnGroup(columnNames: readonly string[]): TOIMColumnGroup {
        if (columnNames.length === 0) {
            throw new Error(
                'OIMColumnOwner.getColumnGroup: a column group names at least one column. A slot that hears every '
                + 'column is the any-column slot: holdAnyColumn.',
            );
        }
        const sortedColumnNames = [...new Set(columnNames)].sort();
        return Object.freeze({ key: oimColumnGroupKeyOfColumnNames(sortedColumnNames), columnNames: Object.freeze(sortedColumnNames) });
    }

    public holdColumnGroup(carrierSlot: TCarrierSlot, columnGroup: TOIMColumnGroup): TColumnSlot {
        const columnSlot = this.getColumnIfFiled(carrierSlot, columnGroup.key) ?? this.mintColumnGroupSlot(carrierSlot, columnGroup);
        this.holdSlot(columnSlot);
        return columnSlot;
    }

    public getAnyColumn(carrierSlot: TCarrierSlot, unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot): TColumnSlot {
        return this.getColumn(carrierSlot, OIM_ANY_COLUMN_KEY, unusedSlotCollectorSlot);
    }

    public holdAnyColumn(carrierSlot: TCarrierSlot): TColumnSlot {
        return this.holdColumn(carrierSlot, OIM_ANY_COLUMN_KEY);
    }

    public getColumn(
        carrierSlot: TCarrierSlot, key: string, unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot,
    ): TColumnSlot {
        const storedColumnSlot = this.getColumnIfFiled(carrierSlot, key);
        if (storedColumnSlot !== undefined) return storedColumnSlot;
        const columnSlot = this.mintUnfiledColumnSlot(carrierSlot, key);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(unusedSlotCollectorSlot, columnSlot);
        return columnSlot;
    }

    public holdColumn(carrierSlot: TCarrierSlot, key: string): TColumnSlot {
        const columnSlot = this.getColumnIfFiled(carrierSlot, key) ?? this.mintUnfiledColumnSlot(carrierSlot, key);
        this.holdSlot(columnSlot);
        return columnSlot;
    }

    public isAnyColumnReferenced(storeSlot: TOIMStoreSlot, changedColumns: readonly string[]): boolean {
        if (storeSlot.anyColumnSlotCount !== 0 && changedColumns.length !== 0) return true;
        const columnReadersByColumnName = storeSlot.columnReadersByColumnName;
        if (columnReadersByColumnName === undefined) return false;
        for (let i = 0; i < changedColumns.length; i++) {
            if (columnReadersByColumnName.has(changedColumns[i])) return true;
        }
        return false;
    }

    public override releaseSlotIfUnheld(slot: TOIMSlot): void {
        if (slot.holdCount > 0) return;
        const columnSlot = slot as TColumnSlot;
        const carrierSlot = this.carrierSlotOf(columnSlot);
        const columnSlotStore = carrierSlot.columnSlotStore;
        if (columnSlotStore === undefined) return;
        const columnSlotStoreService = this.columnSlotStoreService;
        if (columnSlotStoreService.get(columnSlotStore, columnSlot.key) !== columnSlot) return;
        columnSlotStoreService.remove(columnSlotStore, columnSlot.key);
        forgetColumnSlotKey(carrierSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>, columnSlot.key);
        if (columnSlotStoreService.getSlotCount(columnSlotStore) === 0) {
            (carrierSlot as TOIMSlotEditable<TOIMSlot>).columnSlotStore = undefined;
        }
        oimMarkSlotReleased(columnSlot);
        carrierSlot.owner.releaseSlotIfUnheld(carrierSlot);
    }

    protected getColumnGroupsByKeyOf(carrierSlot: TCarrierSlot): Map<string, TOIMColumnGroup> | undefined {
        return (carrierSlot.storeSlot as TOIMStoreSlot).columnGroupsByKey;
    }

    protected getColumnReadersOf(carrierSlot: TCarrierSlot): Map<string, TOIMColumnReaders> | undefined {
        return (carrierSlot.storeSlot as TOIMStoreSlot).columnReadersByColumnName;
    }

    private getColumnIfFiled(carrierSlot: TCarrierSlot, key: string): TColumnSlot | undefined {
        const columnSlotStore = carrierSlot.columnSlotStore;
        return columnSlotStore === undefined ? undefined : this.columnSlotStoreService.get(columnSlotStore, key);
    }

    private mintColumnGroupSlot(carrierSlot: TCarrierSlot, columnGroup: TOIMColumnGroup): TColumnSlot {
        if (columnGroup.key !== oimColumnGroupKeyOfColumnNames(columnGroup.columnNames)
            || columnGroup.key === OIM_ANY_COLUMN_KEY) {
            throw new Error(
                `OIMColumnOwner.holdColumnGroup: "${columnGroup.key}" is not the key of its columns. A column group `
                + 'comes from getColumnGroup, which builds the key from the names.',
            );
        }
        const storeSlot = carrierSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
        const columnGroupsByKey = (storeSlot.columnGroupsByKey ??= new Map<string, TOIMColumnGroup>());
        if (!columnGroupsByKey.has(columnGroup.key)) {
            columnGroupsByKey.set(columnGroup.key, columnGroup);
            const columnNames = columnGroup.columnNames;
            for (let i = 0; i < columnNames.length; i++) getColumnReaders(storeSlot, columnNames[i]).columnGroups.push(columnGroup);
        }
        countColumnGroupSlot(storeSlot, columnGroup.key);
        return this.fileColumnSlot(carrierSlot, columnGroup.key);
    }

    private mintUnfiledColumnSlot(carrierSlot: TCarrierSlot, key: string): TColumnSlot {
        if (isColumnGroupKey(key)) return this.mintColumnGroupSlot(carrierSlot, this.getColumnGroup(oimColumnNamesOfKey(key)));
        const storeSlot = carrierSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
        if (key === OIM_ANY_COLUMN_KEY) storeSlot.anyColumnSlotCount++;
        else getColumnReaders(storeSlot, key).columnSlotCount++;
        return this.fileColumnSlot(carrierSlot, key);
    }

    private fileColumnSlot(carrierSlot: TCarrierSlot, key: string): TColumnSlot {
        const columnSlotStoreService = this.columnSlotStoreService;
        const carrierSlotEditable = carrierSlot as TOIMSlotEditable<TOIMSlot>;
        const columnSlotStore = carrierSlotEditable.columnSlotStore ??= columnSlotStoreService.createStore();
        const columnSlot = this.createColumnSlot(carrierSlot, key);
        columnSlotStoreService.set(columnSlotStore, key, columnSlot);
        return columnSlot;
    }
}

function getColumnReaders(storeSlot: TOIMSlotEditable<TOIMStoreSlot>, columnName: string): TOIMColumnReaders {
    const columnReadersByColumnName = (storeSlot.columnReadersByColumnName ??= new Map<string, TOIMColumnReaders>());
    const storedColumnReaders = columnReadersByColumnName.get(columnName);
    if (storedColumnReaders !== undefined) return storedColumnReaders;
    const columnReaders: TOIMColumnReaders = { columnSlotCount: 0, columnGroups: [] };
    columnReadersByColumnName.set(columnName, columnReaders);
    return columnReaders;
}

function countColumnGroupSlot(storeSlot: TOIMSlotEditable<TOIMStoreSlot>, columnGroupKey: string): void {
    const columnGroupSlotCountsByKey = (storeSlot.columnGroupSlotCountsByKey ??= new Map<string, number>());
    columnGroupSlotCountsByKey.set(columnGroupKey, (columnGroupSlotCountsByKey.get(columnGroupKey) ?? 0) + 1);
}

function isColumnGroupKey(key: string): boolean {
    return key !== OIM_ANY_COLUMN_KEY && key.startsWith(OIM_COLUMN_GROUP_KEY_SEPARATOR);
}

function forgetColumnSlotKey(storeSlot: TOIMSlotEditable<TOIMStoreSlot>, key: string): void {
    if (key === OIM_ANY_COLUMN_KEY) {
        storeSlot.anyColumnSlotCount--;
        return;
    }
    if (isColumnGroupKey(key)) {
        forgetColumnGroupSlot(storeSlot, (storeSlot.columnGroupsByKey as Map<string, TOIMColumnGroup>).get(key) as TOIMColumnGroup);
        return;
    }
    const columnReaders = storeSlot.columnReadersByColumnName?.get(key);
    if (columnReaders === undefined) return;
    columnReaders.columnSlotCount--;
    forgetColumnReadersIfUnread(storeSlot, key, columnReaders);
}

function forgetColumnGroupSlot(storeSlot: TOIMSlotEditable<TOIMStoreSlot>, columnGroup: TOIMColumnGroup): void {
    const columnGroupSlotCountsByKey = storeSlot.columnGroupSlotCountsByKey as Map<string, number>;
    const columnGroupSlotCount = (columnGroupSlotCountsByKey.get(columnGroup.key) as number) - 1;
    if (columnGroupSlotCount !== 0) {
        columnGroupSlotCountsByKey.set(columnGroup.key, columnGroupSlotCount);
        return;
    }
    columnGroupSlotCountsByKey.delete(columnGroup.key);
    (storeSlot.columnGroupsByKey as Map<string, TOIMColumnGroup>).delete(columnGroup.key);
    const columnReadersByColumnName = storeSlot.columnReadersByColumnName as Map<string, TOIMColumnReaders>;
    const columnNames = columnGroup.columnNames;
    for (let i = 0; i < columnNames.length; i++) {
        const columnReaders = columnReadersByColumnName.get(columnNames[i]) as TOIMColumnReaders;
        const columnGroups = columnReaders.columnGroups;
        columnGroups.splice(columnGroups.indexOf(columnGroup), 1);
        forgetColumnReadersIfUnread(storeSlot, columnNames[i], columnReaders);
    }
}

function forgetColumnReadersIfUnread(
    storeSlot: TOIMSlotEditable<TOIMStoreSlot>, columnName: string, columnReaders: TOIMColumnReaders,
): void {
    if (columnReaders.columnSlotCount !== 0 || columnReaders.columnGroups.length !== 0) return;
    (storeSlot.columnReadersByColumnName as Map<string, TOIMColumnReaders>).delete(columnName);
}
