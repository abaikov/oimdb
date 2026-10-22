import type { oimPutEntityColumns } from './oimPutEntityColumns';
import { oimPatchEntityColumns } from './oimPatchEntityColumns';
import { oimClearDepartedEntityColumns } from './oimClearDepartedEntityColumns';
import { oimOwnEntityColumns } from './oimOwnEntityColumns';

export const oimPutEntityColumnsGuarded: typeof oimPutEntityColumns = (
    slot, entity, sameValueGuard, changedColumnNames, targetOf,
) => {
    const prevEntity = slot.entity as Record<string, unknown> | undefined;
    if (prevEntity === undefined) return undefined;
    const ownColumns = oimOwnEntityColumns(entity);
    const target = oimPatchEntityColumns(slot, ownColumns, sameValueGuard, changedColumnNames, targetOf);
    return oimClearDepartedEntityColumns(
        oimOwnEntityColumns(prevEntity), prevEntity, ownColumns, target, changedColumnNames, targetOf,
    );
};
