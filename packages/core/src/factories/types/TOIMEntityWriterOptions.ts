import type { TOIMEntityInserter } from '../../engine/entity/types/TOIMEntityInserter';
import type { TOIMSameValueGuard } from '../../engine/slot/types/TOIMSameValueGuard';
import type { oimPutEntityColumns } from '../../engine/entity/utils/oimPutEntityColumns';
import type { oimPatchEntityColumns } from '../../engine/entity/utils/oimPatchEntityColumns';
import type { oimPatchEntityColumn } from '../../engine/entity/utils/oimPatchEntityColumn';

export type TOIMEntityWriterOptions = {
    sameValueGuard?: TOIMSameValueGuard | undefined;
    entityInserter?: TOIMEntityInserter | undefined;
    putEntityColumns?: typeof oimPutEntityColumns | undefined;
    patchEntityColumns?: typeof oimPatchEntityColumns | undefined;
    patchEntityColumn?: typeof oimPatchEntityColumn | undefined;
};
