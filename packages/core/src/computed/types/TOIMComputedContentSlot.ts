import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from '../interfaces/IOIMComputedValueService';
import type { TOIMComputedDerivation } from './TOIMComputedDerivation';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMComputedContentSlot<TValue = unknown, TSourceTracker extends OIMSourceTracker | undefined = undefined> = TOIMSlot & Readonly<TOIMComputedDerivation> & {
    readonly owner: IOIMSlotOwner;
    readonly computedValueService: IOIMComputedValueService<TValue>;
    readonly value: TValue;
    readonly checkedAtRevision: number;
    readonly checkedAtEpoch: number;
    readonly isDeriving: boolean;
    readonly allRootSlots: readonly TOIMSlot[] | undefined;
    readonly sourceTracker: TSourceTracker;
};
