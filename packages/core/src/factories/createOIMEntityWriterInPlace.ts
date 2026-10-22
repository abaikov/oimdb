import type { IOIMEntityWriter } from '../engine/entity/interfaces/IOIMEntityWriter';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import { oimClearEntity } from '../engine/entity/utils/oimClearEntity';
import type { TOIMEntityWriterOptions } from './types/TOIMEntityWriterOptions';
import { OIM_FROZEN_EMPTY_COLUMN_NAMES } from '../engine/entity/constants/OIM_FROZEN_EMPTY_COLUMN_NAMES';
import { oimOwnedColumnNames } from '../engine/entity/utils/oimOwnedColumnNames';
import { oimEntityWriterOptionsWithDefault } from './utils/oimEntityWriterOptionsWithDefault';

const theEntityItself = (entity: Record<string, unknown>): Record<string, unknown> => entity;

function deleteColumnsInPlace(slot: TOIMEntitySlot, names: readonly string[]): readonly string[] {
    const deleted = oimOwnedColumnNames(slot, names);
    if (deleted === undefined) return OIM_FROZEN_EMPTY_COLUMN_NAMES;
    const entity = slot.entity as Record<string, unknown>;
    for (let i = 0; i < deleted.length; i++) entity[deleted[i]] = undefined;
    return deleted;
}

export function createOIMEntityWriterInPlace(
    options?: TOIMEntityWriterOptions,
): IOIMEntityWriter {
    const {
        sameValueGuard, entityInsertStrategy, putEntityColumns, patchEntityColumns, patchEntityColumn,
    } = oimEntityWriterOptionsWithDefault(options);
    return {
        fillEntity: entityInsertStrategy,
        clearEntity: oimClearEntity,
        putEntity: (slot, entity, changedColumnNames) =>
            putEntityColumns(slot, entity, sameValueGuard, changedColumnNames, theEntityItself) !== undefined,
        patchEntity: (slot, patch, changedColumnNames) =>
            patchEntityColumns(slot, patch, sameValueGuard, changedColumnNames, theEntityItself) !== undefined,
        patchColumn: (slot, columnName, value, changedColumnNames) =>
            patchEntityColumn(slot, columnName, value, sameValueGuard, changedColumnNames, theEntityItself) !== undefined,
        deleteColumns: deleteColumnsInPlace,
    };
}
