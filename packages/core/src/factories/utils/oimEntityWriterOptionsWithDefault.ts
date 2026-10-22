import type { TOIMEntityWriterOptions } from '../types/TOIMEntityWriterOptions';
import { oimInsertEntityWithoutCopy } from '../../engine/entity/utils/oimInsertEntityWithoutCopy';
import { oimPatchEntityColumns } from '../../engine/entity/utils/oimPatchEntityColumns';
import { oimPatchEntityColumn } from '../../engine/entity/utils/oimPatchEntityColumn';
import { oimPutEntityColumns } from '../../engine/entity/utils/oimPutEntityColumns';
import { oimSameValueZeroGuard } from '../../engine/slot/utils/oimSameValueZeroGuard';

export function oimEntityWriterOptionsWithDefault(
    options: TOIMEntityWriterOptions | undefined,
): { [TOption in keyof TOIMEntityWriterOptions]-?: NonNullable<TOIMEntityWriterOptions[TOption]> } {
    return {
        sameValueGuard: options?.sameValueGuard ?? oimSameValueZeroGuard,
        entityInsertStrategy: options?.entityInsertStrategy ?? oimInsertEntityWithoutCopy,
        putEntityColumns: options?.putEntityColumns ?? oimPutEntityColumns,
        patchEntityColumns: options?.patchEntityColumns ?? oimPatchEntityColumns,
        patchEntityColumn: options?.patchEntityColumn ?? oimPatchEntityColumn,
    };
}
