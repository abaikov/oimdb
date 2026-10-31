import type { IOIMEntityWriter, OIMEntitySlot, TOIMDisposer, TOIMEntitySlot } from '@oimdb/core';
import type { TOIMPersistEntityWriterOptions } from './types/TOIMPersistEntityWriterOptions';

export class OIMPersistEntityWriter<TEntity extends object, TKey extends NonNullable<unknown>> implements IOIMEntityWriter {
    private readonly entityWriter: IOIMEntityWriter;
    private readonly entitySlotWrittenListeners = new Set<(entitySlot: TOIMEntitySlot<TEntity, TKey>) => void>();

    public constructor(persistEntityWriterOptions: TOIMPersistEntityWriterOptions) {
        this.entityWriter = persistEntityWriterOptions.entityWriter;
    }

    public subscribeEntitySlotWritten(
        onEntitySlotWritten: (entitySlot: TOIMEntitySlot<TEntity, TKey>) => void,
    ): TOIMDisposer {
        this.entitySlotWrittenListeners.add(onEntitySlotWritten);
        return () => { this.entitySlotWrittenListeners.delete(onEntitySlotWritten); };
    }

    public readonly fillEntity = (entitySlot: OIMEntitySlot, entity: object): void => {
        this.entityWriter.fillEntity(entitySlot, entity);
        this.notifyEntitySlotWrittenListeners(entitySlot);
    };

    public readonly putEntity = (
        entitySlot: OIMEntitySlot, entity: object, changedColumnNames: string[] | undefined,
    ): boolean => {
        if (!this.entityWriter.putEntity(entitySlot, entity, changedColumnNames)) return false;
        this.notifyEntitySlotWrittenListeners(entitySlot);
        return true;
    };

    public readonly patchEntity = (
        entitySlot: OIMEntitySlot, patch: object, changedColumnNames: string[] | undefined,
    ): boolean => {
        if (!this.entityWriter.patchEntity(entitySlot, patch, changedColumnNames)) return false;
        this.notifyEntitySlotWrittenListeners(entitySlot);
        return true;
    };

    public readonly patchColumn = (
        entitySlot: OIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ): boolean => {
        if (!this.entityWriter.patchColumn(entitySlot, columnName, value, changedColumnNames)) return false;
        this.notifyEntitySlotWrittenListeners(entitySlot);
        return true;
    };

    public readonly deleteColumns = (entitySlot: OIMEntitySlot, columnNames: readonly string[]): readonly string[] => {
        const deletedColumnNames = this.entityWriter.deleteColumns(entitySlot, columnNames);
        if (deletedColumnNames.length !== 0) this.notifyEntitySlotWrittenListeners(entitySlot);
        return deletedColumnNames;
    };

    public readonly clearEntity = (entitySlot: OIMEntitySlot): void => {
        this.entityWriter.clearEntity(entitySlot);
        this.notifyEntitySlotWrittenListeners(entitySlot);
    };

    private notifyEntitySlotWrittenListeners(entitySlot: OIMEntitySlot): void {
        const entitySlotWrittenListeners = this.entitySlotWrittenListeners;
        if (entitySlotWrittenListeners.size === 0) return;
        const writtenEntitySlot = entitySlot as unknown as TOIMEntitySlot<TEntity, TKey>;
        for (const onEntitySlotWritten of entitySlotWrittenListeners) onEntitySlotWritten(writtenEntitySlot);
    }
}
