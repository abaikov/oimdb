import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import { OIMSlotMapStoreService } from '../../engine/store/OIMSlotMapStoreService';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE = /* @__PURE__ */ new OIMDefaultValue<IOIMSlotStoreService<string, TOIMColumnSlot>>('COLUMN_SLOT_STORE_SERVICE', () => OIMSlotMapStoreService.INSTANCE as unknown as IOIMSlotStoreService<string, TOIMColumnSlot>);
