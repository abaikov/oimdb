import { patchOIMEntityColumn } from './patchOIMEntityColumn';
import { isOIMProtoKey } from './isOIMProtoKey';

export const guardOIMEntityColumnPatch: typeof patchOIMEntityColumn = (
    slot, columnName, value, sameValueGuard, changedColumnNames, targetOf,
) => (isOIMProtoKey(columnName)
    ? undefined
    : patchOIMEntityColumn(slot, columnName, value, sameValueGuard, changedColumnNames, targetOf));
