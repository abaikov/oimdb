import { patchOIMEntityColumns } from './patchOIMEntityColumns';
import { copyOIMOwnEntityColumns } from './copyOIMOwnEntityColumns';

export const guardOIMEntityColumnsPatch: typeof patchOIMEntityColumns = (
    slot, patch, sameValueGuard, changedColumnNames, targetOf,
) => patchOIMEntityColumns(slot, copyOIMOwnEntityColumns(patch), sameValueGuard, changedColumnNames, targetOf);
