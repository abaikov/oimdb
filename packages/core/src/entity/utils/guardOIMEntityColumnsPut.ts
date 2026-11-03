import type { putOIMEntityColumns } from './putOIMEntityColumns';
import { patchOIMEntityColumns } from './patchOIMEntityColumns';
import { clearOIMDepartedEntityColumns } from './clearOIMDepartedEntityColumns';
import { copyOIMOwnEntityColumns } from './copyOIMOwnEntityColumns';

export const guardOIMEntityColumnsPut: typeof putOIMEntityColumns = (
    slot, entity, sameValueGuard, changedColumnNames, targetOf,
) => {
    const prevEntity = slot.content as Record<string, unknown> | undefined;
    if (prevEntity === undefined) return undefined;
    const ownColumns = copyOIMOwnEntityColumns(entity);
    const target = patchOIMEntityColumns(slot, ownColumns, sameValueGuard, changedColumnNames, targetOf);
    return clearOIMDepartedEntityColumns(
        copyOIMOwnEntityColumns(prevEntity), prevEntity, ownColumns, target, changedColumnNames, targetOf,
    );
};
