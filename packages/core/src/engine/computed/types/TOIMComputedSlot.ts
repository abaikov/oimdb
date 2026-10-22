import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from '../interfaces/IOIMComputedValueService';
import type { TOIMDerivation } from './TOIMDerivation';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export type TOIMComputedSlot<TValue = unknown, TKey = unknown> = TOIMIndexableSlot<TKey> & Readonly<TOIMDerivation> & {
    readonly owner: IOIMSlotOwner;
    readonly computedValueService: IOIMComputedValueService<TValue>;
    readonly value: TValue;
    readonly checkedAtRevision: number;
    readonly checkedAtEpoch: number;
    readonly isDeriving: boolean;
    readonly allRootSlots: readonly TOIMSlot[] | undefined;
};
