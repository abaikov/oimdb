import type { TOIMEntityInserter } from './TOIMEntityInserter';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { putOIMEntityColumns } from '../utils/putOIMEntityColumns';
import type { patchOIMEntityColumns } from '../utils/patchOIMEntityColumns';
import type { patchOIMEntityColumn } from '../utils/patchOIMEntityColumn';

export type TOIMEntityWriterOptions = {
    sameValueGuard?: TOIMSameValueGuard | undefined;
    entityInserter?: TOIMEntityInserter | undefined;
    putEntityColumns?: typeof putOIMEntityColumns | undefined;
    patchEntityColumns?: typeof patchOIMEntityColumns | undefined;
    patchEntityColumn?: typeof patchOIMEntityColumn | undefined;
};
