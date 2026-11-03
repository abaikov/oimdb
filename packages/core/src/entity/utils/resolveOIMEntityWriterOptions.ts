import type { TOIMEntityWriterOptions } from '../types/TOIMEntityWriterOptions';
import { insertOIMEntityWithoutCopy } from './insertOIMEntityWithoutCopy';
import { patchOIMEntityColumns } from './patchOIMEntityColumns';
import { patchOIMEntityColumn } from './patchOIMEntityColumn';
import { putOIMEntityColumns } from './putOIMEntityColumns';
import { isOIMSameValueZero } from '../../slot/utils/isOIMSameValueZero';

export function resolveOIMEntityWriterOptions(
    options: TOIMEntityWriterOptions | undefined,
): { [TOption in keyof TOIMEntityWriterOptions]-?: NonNullable<TOIMEntityWriterOptions[TOption]> } {
    return {
        sameValueGuard: options?.sameValueGuard ?? isOIMSameValueZero,
        entityInserter: options?.entityInserter ?? insertOIMEntityWithoutCopy,
        putEntityColumns: options?.putEntityColumns ?? putOIMEntityColumns,
        patchEntityColumns: options?.patchEntityColumns ?? patchOIMEntityColumns,
        patchEntityColumn: options?.patchEntityColumn ?? patchOIMEntityColumn,
    };
}
