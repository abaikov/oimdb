import type { IOIMEntityWriter } from '../engine/entity/interfaces/IOIMEntityWriter';
import { oimClearEntity } from '../engine/entity/utils/oimClearEntity';
import { oimCopyEntity } from '../engine/entity/utils/oimCopyEntity';
import type { TOIMEntityWriterOptions } from './types/TOIMEntityWriterOptions';
import { OIM_FROZEN_EMPTY_COLUMN_NAMES } from '../engine/entity/constants/OIM_FROZEN_EMPTY_COLUMN_NAMES';
import { oimOwnedColumnNames } from '../engine/entity/utils/oimOwnedColumnNames';
import { oimEntityWriterOptionsWithDefault } from './utils/oimEntityWriterOptionsWithDefault';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMSlotEditable } from '../engine/slot/types/TOIMSlotEditable';

function storeReplacement(slot: TOIMEntitySlot, next: Record<string, unknown> | undefined): boolean {
    if (next === undefined) return false;
    (slot as TOIMSlotEditable<TOIMEntitySlot>).entity = next;
    return true;
}

function deleteColumnsReplacing(slot: TOIMEntitySlot, names: readonly string[]): readonly string[] {
    const deleted = oimOwnedColumnNames(slot, names);
    if (deleted === undefined) return OIM_FROZEN_EMPTY_COLUMN_NAMES;
    const next = oimCopyEntity(slot.entity as object);
    for (let i = 0; i < deleted.length; i++) next[deleted[i]] = undefined;
    (slot as TOIMSlotEditable<TOIMEntitySlot>).entity = next;
    return deleted;
}

export function createOIMEntityWriterReplacing(
    options?: TOIMEntityWriterOptions,
): IOIMEntityWriter {
    const {
        sameValueGuard, entityInsertStrategy, putEntityColumns, patchEntityColumns, patchEntityColumn,
    } = oimEntityWriterOptionsWithDefault(options);
    return {
        fillEntity: entityInsertStrategy,
        clearEntity: oimClearEntity,
        putEntity: (slot, entity, changedColumnNames) =>
            storeReplacement(slot, putEntityColumns(slot, entity, sameValueGuard, changedColumnNames, oimCopyEntity)),
        patchEntity: (slot, patch, changedColumnNames) =>
            storeReplacement(slot, patchEntityColumns(slot, patch, sameValueGuard, changedColumnNames, oimCopyEntity)),
        patchColumn: (slot, columnName, value, changedColumnNames) =>
            storeReplacement(slot, patchEntityColumn(slot, columnName, value, sameValueGuard, changedColumnNames, oimCopyEntity)),
        deleteColumns: deleteColumnsReplacing,
    };
}
