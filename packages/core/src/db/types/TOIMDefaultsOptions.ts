import type { IOIMEntityWriter } from '../../entity/interfaces/IOIMEntityWriter';
import type { IOIMIndexKeysService } from '../../index/interfaces/IOIMIndexKeysService';
import type { IOIMSlotStamp } from '../../slot/interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotEmptinessPolicy } from '../../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from '../../slot/interfaces/IOIMStoreSlotListener';
import type { TOIMEntityContentSlot } from '../../entity/types/TOIMEntityContentSlot';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export type TOIMDefaultsOptions = {
    slotStamp?: IOIMSlotStamp<TOIMSlot> | undefined;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    entityWriter?: IOIMEntityWriter | undefined;
    entitySlotEmptinessPolicy?: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot> | undefined;
    indexKeysService?: IOIMIndexKeysService | undefined;
    columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
    computedColumnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
    storeSlotListener?: IOIMStoreSlotListener | undefined;
};
