import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import { OIMSlotMapStoreService } from '../../engine/store/OIMSlotMapStoreService';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE = /* @__PURE__ */ new OIMDefaultValue<IOIMSlotStoreService<string, TOIMComputedColumnSlot>>('COMPUTED_COLUMN_SLOT_STORE_SERVICE', () => OIMSlotMapStoreService.INSTANCE as unknown as IOIMSlotStoreService<string, TOIMComputedColumnSlot>);
