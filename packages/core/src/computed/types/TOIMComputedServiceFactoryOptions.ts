import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMComputedValueReleaser } from './TOIMComputedValueReleaser';
import type { OIMDefaults } from '../../db/OIMDefaults';

export type TOIMComputedServiceFactoryOptions<TValue> = {
    defaults?: OIMDefaults | undefined;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
    releaseValue?: TOIMComputedValueReleaser<TValue> | undefined;
    initialValue?: TValue | undefined;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
    columnNames?: readonly Extract<keyof TValue, string>[] | undefined;
};
