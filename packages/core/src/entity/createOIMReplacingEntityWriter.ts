import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import { oimClearEntity } from './utils/oimClearEntity';
import { oimCopyEntity } from './utils/oimCopyEntity';
import type { TOIMEntityWriterOptions } from './types/TOIMEntityWriterOptions';
import { OIM_FROZEN_EMPTY_COLUMN_NAMES } from './constants/OIM_FROZEN_EMPTY_COLUMN_NAMES';
import { oimOwnedColumnNames } from './utils/oimOwnedColumnNames';
import { oimResolveEntityWriterOptions } from './utils/oimResolveEntityWriterOptions';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';

function storeReplacement(slot: TOIMEntityContentSlot, next: Record<string, unknown> | undefined): boolean {
    if (next === undefined) return false;
    (slot as TOIMEditable<TOIMEntityContentSlot>).entity = next;
    return true;
}

function deleteColumnsInCopy(slot: TOIMEntityContentSlot, names: readonly string[]): readonly string[] {
    const deleted = oimOwnedColumnNames(slot, names);
    if (deleted === undefined) return OIM_FROZEN_EMPTY_COLUMN_NAMES;
    const next = oimCopyEntity(slot.entity as object);
    for (let i = 0; i < deleted.length; i++) next[deleted[i]] = undefined;
    (slot as TOIMEditable<TOIMEntityContentSlot>).entity = next;
    return deleted;
}

export function createOIMReplacingEntityWriter(
    options?: TOIMEntityWriterOptions,
): IOIMEntityWriter {
    const {
        sameValueGuard, entityInserter, putEntityColumns, patchEntityColumns, patchEntityColumn,
    } = oimResolveEntityWriterOptions(options);
    return {
        fillEntity: entityInserter,
        clearEntity: oimClearEntity,
        putEntity: (slot, entity, changedColumnNames) =>
            storeReplacement(slot, putEntityColumns(slot, entity, sameValueGuard, changedColumnNames, oimCopyEntity)),
        patchEntity: (slot, patch, changedColumnNames) =>
            storeReplacement(slot, patchEntityColumns(slot, patch, sameValueGuard, changedColumnNames, oimCopyEntity)),
        patchColumn: (slot, columnName, value, changedColumnNames) =>
            storeReplacement(slot, patchEntityColumn(slot, columnName, value, sameValueGuard, changedColumnNames, oimCopyEntity)),
        deleteColumns: deleteColumnsInCopy,
    };
}
