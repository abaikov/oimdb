import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import type { OIMEntitySlot } from './OIMEntitySlot';
import { clearOIMEntity } from './utils/clearOIMEntity';
import type { TOIMEntityWriterOptions } from './types/TOIMEntityWriterOptions';
import { OIM_FROZEN_EMPTY_COLUMN_NAMES } from './constants/OIM_FROZEN_EMPTY_COLUMN_NAMES';
import { getOIMOwnedColumnNames } from './utils/getOIMOwnedColumnNames';
import { resolveOIMEntityWriterOptions } from './utils/resolveOIMEntityWriterOptions';

const theEntityItself = (entity: Record<string, unknown>): Record<string, unknown> => entity;

function deleteColumnsInPlace(slot: OIMEntitySlot, names: readonly string[]): readonly string[] {
    const deleted = getOIMOwnedColumnNames(slot, names);
    if (deleted === undefined) return OIM_FROZEN_EMPTY_COLUMN_NAMES;
    const entity = slot.content as Record<string, unknown>;
    for (let i = 0; i < deleted.length; i++) entity[deleted[i]] = undefined;
    return deleted;
}

export function createOIMInPlaceEntityWriter(
    options?: TOIMEntityWriterOptions,
): IOIMEntityWriter {
    const {
        sameValueGuard, entityInserter, putEntityColumns, patchEntityColumns, patchEntityColumn,
    } = resolveOIMEntityWriterOptions(options);
    return {
        fillEntity: entityInserter,
        clearEntity: clearOIMEntity,
        putEntity: (slot, entity, changedColumnNames) =>
            putEntityColumns(slot, entity, sameValueGuard, changedColumnNames, theEntityItself) !== undefined,
        patchEntity: (slot, patch, changedColumnNames) =>
            patchEntityColumns(slot, patch, sameValueGuard, changedColumnNames, theEntityItself) !== undefined,
        patchColumn: (slot, columnName, value, changedColumnNames) =>
            patchEntityColumn(slot, columnName, value, sameValueGuard, changedColumnNames, theEntityItself) !== undefined,
        deleteColumns: deleteColumnsInPlace,
    };
}
