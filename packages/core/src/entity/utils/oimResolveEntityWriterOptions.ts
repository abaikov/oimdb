import type { TOIMEntityWriterOptions } from '../types/TOIMEntityWriterOptions';
import { oimInsertEntityWithoutCopy } from './oimInsertEntityWithoutCopy';
import { oimPatchEntityColumns } from './oimPatchEntityColumns';
import { oimPatchEntityColumn } from './oimPatchEntityColumn';
import { oimPutEntityColumns } from './oimPutEntityColumns';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';

export function oimResolveEntityWriterOptions(
    options: TOIMEntityWriterOptions | undefined,
): { [TOption in keyof TOIMEntityWriterOptions]-?: NonNullable<TOIMEntityWriterOptions[TOption]> } {
    return {
        sameValueGuard: options?.sameValueGuard ?? oimSameValueZeroGuard,
        entityInserter: options?.entityInserter ?? oimInsertEntityWithoutCopy,
        putEntityColumns: options?.putEntityColumns ?? oimPutEntityColumns,
        patchEntityColumns: options?.patchEntityColumns ?? oimPatchEntityColumns,
        patchEntityColumn: options?.patchEntityColumn ?? oimPatchEntityColumn,
    };
}
