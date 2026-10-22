import { oimPatchEntityColumn } from './oimPatchEntityColumn';
import { oimIsProtoKey } from './oimIsProtoKey';

export const oimPatchEntityColumnGuarded: typeof oimPatchEntityColumn = (
    slot, columnName, value, sameValueGuard, changedColumnNames, targetOf,
) => (oimIsProtoKey(columnName)
    ? undefined
    : oimPatchEntityColumn(slot, columnName, value, sameValueGuard, changedColumnNames, targetOf));
