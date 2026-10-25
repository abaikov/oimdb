import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';

export interface IOIMEntityWriter {
    readonly fillEntity: (slot: TOIMEntityContentSlot, entity: object) => void;
    readonly putEntity: (slot: TOIMEntityContentSlot, entity: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchEntity: (slot: TOIMEntityContentSlot, patch: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchColumn: (
        slot: TOIMEntityContentSlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ) => boolean;
    readonly deleteColumns: (slot: TOIMEntityContentSlot, names: readonly string[]) => readonly string[];
    readonly clearEntity: (slot: TOIMEntityContentSlot) => void;
}
