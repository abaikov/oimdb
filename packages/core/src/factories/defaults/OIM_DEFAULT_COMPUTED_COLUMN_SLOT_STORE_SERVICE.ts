import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import { OIMSlotStoreServiceMapDriven } from '../../engine/store/OIMSlotStoreServiceMapDriven';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE = /* @__PURE__ */ new OIMDefaultValue<IOIMSlotStoreService<string, TOIMComputedColumnSlot>>('COMPUTED_COLUMN_SLOT_STORE_SERVICE', () => OIMSlotStoreServiceMapDriven.INSTANCE as IOIMSlotStoreService<unknown, TOIMKeyedSlot<unknown>, unknown> as IOIMSlotStoreService<string, TOIMComputedColumnSlot>);
