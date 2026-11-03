import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import { clearOIMEntity } from './utils/clearOIMEntity';
import { copyOIMEntity } from './utils/copyOIMEntity';
import type { TOIMEntityWriterOptions } from './types/TOIMEntityWriterOptions';
import { OIM_FROZEN_EMPTY_COLUMN_NAMES } from './constants/OIM_FROZEN_EMPTY_COLUMN_NAMES';
import { getOIMOwnedColumnNames } from './utils/getOIMOwnedColumnNames';
import { resolveOIMEntityWriterOptions } from './utils/resolveOIMEntityWriterOptions';
import type { OIMEntitySlot } from './OIMEntitySlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';

function storeReplacement(slot: OIMEntitySlot, next: Record<string, unknown> | undefined): boolean {
    if (next === undefined) return false;
    (slot as TOIMEditable<OIMEntitySlot>).content = next;
    return true;
}

function deleteColumnsInCopy(slot: OIMEntitySlot, names: readonly string[]): readonly string[] {
    const deleted = getOIMOwnedColumnNames(slot, names);
    if (deleted === undefined) return OIM_FROZEN_EMPTY_COLUMN_NAMES;
    const next = copyOIMEntity(slot.content as object);
    for (let i = 0; i < deleted.length; i++) next[deleted[i]] = undefined;
    (slot as TOIMEditable<OIMEntitySlot>).content = next;
    return deleted;
}

export function createOIMReplacingEntityWriter(
    options?: TOIMEntityWriterOptions,
): IOIMEntityWriter {
    const {
        sameValueGuard, entityInserter, putEntityColumns, patchEntityColumns, patchEntityColumn,
    } = resolveOIMEntityWriterOptions(options);
    return {
        fillEntity: entityInserter,
        clearEntity: clearOIMEntity,
        putEntity: (slot, entity, changedColumnNames) =>
            storeReplacement(slot, putEntityColumns(slot, entity, sameValueGuard, changedColumnNames, copyOIMEntity)),
        patchEntity: (slot, patch, changedColumnNames) =>
            storeReplacement(slot, patchEntityColumns(slot, patch, sameValueGuard, changedColumnNames, copyOIMEntity)),
        patchColumn: (slot, columnName, value, changedColumnNames) =>
            storeReplacement(slot, patchEntityColumn(slot, columnName, value, sameValueGuard, changedColumnNames, copyOIMEntity)),
        deleteColumns: deleteColumnsInCopy,
    };
}
