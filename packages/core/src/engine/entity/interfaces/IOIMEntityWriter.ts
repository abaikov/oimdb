import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';

export interface IOIMEntityWriter {
    readonly fillEntity: (slot: TOIMEntitySlot, entity: object) => void;
    readonly putEntity: (slot: TOIMEntitySlot, entity: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchEntity: (slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchColumn: (
        slot: TOIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ) => boolean;
    readonly deleteColumns: (slot: TOIMEntitySlot, names: readonly string[]) => readonly string[];
    readonly clearEntity: (slot: TOIMEntitySlot) => void;
}
