import type { IOIMSlotContentChangeListener } from './interfaces/IOIMSlotContentChangeListener';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMEditable } from './types/TOIMEditable';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { TOIMSlotContentChangeListenerReadColumns } from './types/TOIMSlotContentChangeListenerReadColumns';

export class OIMSlotContentChangeListenerService {
    public static readonly INSTANCE = new OIMSlotContentChangeListenerService();

    public addContentChangeListener<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>,
        listener: IOIMSlotContentChangeListener<TSlot, TPatch>,
        readColumnNames: readonly string[] | undefined,
    ): TOIMSlotContentChangeListenerReadColumns {
        const editableStoreSlot = storeSlot as TOIMEditable<TOIMStoreSlot<unknown, TSlot, TPatch>>;
        if (editableStoreSlot.contentChangeListeners === undefined) {
            editableStoreSlot.contentChangeListeners = [];
            editableStoreSlot.contentChangeListenerReadColumns = [];
        }
        editableStoreSlot.contentChangeListeners.push(listener);
        const listenerReadColumns: TOIMSlotContentChangeListenerReadColumns = {
            declaredColumnNames: readColumnNames, addedColumnNames: new Set<string>(), isAnyColumnAdded: false,
        };
        (editableStoreSlot.contentChangeListenerReadColumns as TOIMSlotContentChangeListenerReadColumns[]).push(listenerReadColumns);
        if (readColumnNames === undefined) this.addReadAnyColumn(storeSlot);
        else for (let i = 0; i < readColumnNames.length; i++) this.addReadColumn(storeSlot, readColumnNames[i]);
        return listenerReadColumns;
    }

    public removeContentChangeListener<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>, listener: IOIMSlotContentChangeListener<TSlot, TPatch>,
    ): boolean {
        const listeners = storeSlot.contentChangeListeners;
        if (listeners === undefined) return false;
        const at = listeners.indexOf(listener);
        if (at < 0) return false;
        const contentChangeListenerReadColumns = storeSlot.contentChangeListenerReadColumns as TOIMSlotContentChangeListenerReadColumns[];
        const listenerReadColumns = contentChangeListenerReadColumns[at];
        listeners.splice(at, 1);
        contentChangeListenerReadColumns.splice(at, 1);
        const declaredColumnNames = listenerReadColumns.declaredColumnNames;
        if (declaredColumnNames === undefined) this.removeReadAnyColumn(storeSlot);
        else for (let i = 0; i < declaredColumnNames.length; i++) this.removeReadColumn(storeSlot, declaredColumnNames[i]);
        for (const columnName of listenerReadColumns.addedColumnNames) this.removeReadColumn(storeSlot, columnName);
        if (listenerReadColumns.isAnyColumnAdded) this.removeReadAnyColumn(storeSlot);
        return true;
    }

    public addListenerReadColumn<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>, listener: IOIMSlotContentChangeListener<TSlot, TPatch>, columnName: string,
    ): void {
        const listenerReadColumns = this.listenerReadColumnsOf(storeSlot, listener);
        const addedColumnNames = listenerReadColumns.addedColumnNames;
        if (addedColumnNames.has(columnName)) return;
        addedColumnNames.add(columnName);
        this.addReadColumn(storeSlot, columnName);
    }

    public addListenerReadAnyColumn<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>, listener: IOIMSlotContentChangeListener<TSlot, TPatch>,
    ): void {
        const listenerReadColumns = this.listenerReadColumnsOf(storeSlot, listener);
        if (listenerReadColumns.isAnyColumnAdded) return;
        listenerReadColumns.isAnyColumnAdded = true;
        this.addReadAnyColumn(storeSlot);
    }

    private addReadColumn(storeSlot: TOIMStoreSlot, columnName: string): void {
        const columnListenerCountsByColumnName = ((storeSlot as TOIMEditable<TOIMStoreSlot>).columnListenerCountsByColumnName ??= new Map<string, number>());
        columnListenerCountsByColumnName.set(columnName, (columnListenerCountsByColumnName.get(columnName) ?? 0) + 1);
    }

    private removeReadColumn(storeSlot: TOIMStoreSlot, columnName: string): void {
        const columnListenerCountsByColumnName = storeSlot.columnListenerCountsByColumnName;
        if (columnListenerCountsByColumnName === undefined) return;
        const columnListenerCount = columnListenerCountsByColumnName.get(columnName);
        if (columnListenerCount === undefined) return;
        if (columnListenerCount === 1) columnListenerCountsByColumnName.delete(columnName);
        else columnListenerCountsByColumnName.set(columnName, columnListenerCount - 1);
    }

    private addReadAnyColumn(storeSlot: TOIMStoreSlot): void {
        (storeSlot as TOIMEditable<TOIMStoreSlot>).allColumnsListenerCount++;
    }

    private removeReadAnyColumn(storeSlot: TOIMStoreSlot): void {
        if (storeSlot.allColumnsListenerCount !== 0) (storeSlot as TOIMEditable<TOIMStoreSlot>).allColumnsListenerCount--;
    }

    private listenerReadColumnsOf<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>, listener: IOIMSlotContentChangeListener<TSlot, TPatch>,
    ): TOIMSlotContentChangeListenerReadColumns {
        const at = (storeSlot.contentChangeListeners as IOIMSlotContentChangeListener<TSlot, TPatch>[]).indexOf(listener);
        if (at >= 0) return (storeSlot.contentChangeListenerReadColumns as TOIMSlotContentChangeListenerReadColumns[])[at];
        throw new Error(
            'OIMSlotContentChangeListenerService: this listener is not on the store slot, so it has no read columns to grow or to ask. '
            + 'Add it with addContentChangeListener first.',
        );
    }
}
