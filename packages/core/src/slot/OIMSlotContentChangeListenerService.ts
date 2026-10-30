import type { IOIMSlotContentChangeListener } from './interfaces/IOIMSlotContentChangeListener';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMEditable } from './types/TOIMEditable';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';

export class OIMSlotContentChangeListenerService {
    public static readonly INSTANCE = new OIMSlotContentChangeListenerService();

    public addContentChangeListener<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>,
        listener: IOIMSlotContentChangeListener<TSlot, TPatch>,
        readColumnNames: readonly string[] | undefined,
    ): void {
        const editableStoreSlot = storeSlot as TOIMEditable<TOIMStoreSlot<unknown, TSlot, TPatch>>;
        if (editableStoreSlot.contentChangeListeners === undefined) {
            editableStoreSlot.contentChangeListeners = [];
            editableStoreSlot.contentChangeListenerReadColumnNames = [];
        }
        editableStoreSlot.contentChangeListeners.push(listener);
        (editableStoreSlot.contentChangeListenerReadColumnNames as (readonly string[] | undefined)[]).push(readColumnNames);
        if (readColumnNames === undefined) this.addReadAnyColumn(storeSlot);
        else for (let i = 0; i < readColumnNames.length; i++) this.addReadColumn(storeSlot, readColumnNames[i]);
    }

    public removeContentChangeListener<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>, listener: IOIMSlotContentChangeListener<TSlot, TPatch>,
    ): boolean {
        const listeners = storeSlot.contentChangeListeners;
        if (listeners === undefined) return false;
        const at = listeners.indexOf(listener);
        if (at < 0) return false;
        const contentChangeListenerReadColumnNames = storeSlot.contentChangeListenerReadColumnNames as (readonly string[] | undefined)[];
        const readColumnNames = contentChangeListenerReadColumnNames[at];
        listeners.splice(at, 1);
        contentChangeListenerReadColumnNames.splice(at, 1);
        if (readColumnNames === undefined) this.removeReadAnyColumn(storeSlot);
        else for (let i = 0; i < readColumnNames.length; i++) this.removeReadColumn(storeSlot, readColumnNames[i]);
        return true;
    }

    public addReadColumn(storeSlot: TOIMStoreSlot, columnName: string): void {
        const columnListenerCountsByColumnName = ((storeSlot as TOIMEditable<TOIMStoreSlot>).columnListenerCountsByColumnName ??= new Map<string, number>());
        columnListenerCountsByColumnName.set(columnName, (columnListenerCountsByColumnName.get(columnName) ?? 0) + 1);
    }

    public removeReadColumn(storeSlot: TOIMStoreSlot, columnName: string): void {
        const columnListenerCountsByColumnName = storeSlot.columnListenerCountsByColumnName;
        if (columnListenerCountsByColumnName === undefined) return;
        const columnListenerCount = columnListenerCountsByColumnName.get(columnName);
        if (columnListenerCount === undefined) return;
        if (columnListenerCount === 1) columnListenerCountsByColumnName.delete(columnName);
        else columnListenerCountsByColumnName.set(columnName, columnListenerCount - 1);
    }

    public addReadAnyColumn(storeSlot: TOIMStoreSlot): void {
        (storeSlot as TOIMEditable<TOIMStoreSlot>).allColumnsListenerCount++;
    }

    public removeReadAnyColumn(storeSlot: TOIMStoreSlot): void {
        if (storeSlot.allColumnsListenerCount !== 0) (storeSlot as TOIMEditable<TOIMStoreSlot>).allColumnsListenerCount--;
    }
}
