import { oimPatchEntityColumns } from './oimPatchEntityColumns';
import { oimOwnEntityColumns } from './oimOwnEntityColumns';

export const oimPatchEntityColumnsGuarded: typeof oimPatchEntityColumns = (
    slot, patch, sameValueGuard, changedColumnNames, targetOf,
) => oimPatchEntityColumns(slot, oimOwnEntityColumns(patch), sameValueGuard, changedColumnNames, targetOf);
