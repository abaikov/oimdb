import type { OIMEntitySlot } from '../OIMEntitySlot';

export interface IOIMEntityWriter {
    readonly fillEntity: (slot: OIMEntitySlot, entity: object) => void;
    readonly putEntity: (slot: OIMEntitySlot, entity: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchEntity: (slot: OIMEntitySlot, patch: object, changedColumnNames: string[] | undefined) => boolean;
    readonly patchColumn: (
        slot: OIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ) => boolean;
    readonly deleteColumns: (slot: OIMEntitySlot, names: readonly string[]) => readonly string[];
    readonly clearEntity: (slot: OIMEntitySlot) => void;
}
