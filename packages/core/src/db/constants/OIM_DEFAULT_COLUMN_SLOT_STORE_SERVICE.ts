import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import { OIMSlotMapStoreService } from '../../store/OIMSlotMapStoreService';
import { OIMDefaultValue } from '../OIMDefaultValue';

export const OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE = /* @__PURE__ */ new OIMDefaultValue<IOIMSlotStoreService<string, TOIMColumnSlot>>('COLUMN_SLOT_STORE_SERVICE', () => OIMSlotMapStoreService.INSTANCE as unknown as IOIMSlotStoreService<string, TOIMColumnSlot>);
