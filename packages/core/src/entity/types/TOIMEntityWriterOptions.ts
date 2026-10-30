import type { TOIMEntityInserter } from './TOIMEntityInserter';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { oimPutEntityColumns } from '../utils/oimPutEntityColumns';
import type { oimPatchEntityColumns } from '../utils/oimPatchEntityColumns';
import type { oimPatchEntityColumn } from '../utils/oimPatchEntityColumn';

export type TOIMEntityWriterOptions = {
    sameValueGuard?: TOIMSameValueGuard | undefined;
    entityInserter?: TOIMEntityInserter | undefined;
    putEntityColumns?: typeof oimPutEntityColumns | undefined;
    patchEntityColumns?: typeof oimPatchEntityColumns | undefined;
    patchEntityColumn?: typeof oimPatchEntityColumn | undefined;
};
