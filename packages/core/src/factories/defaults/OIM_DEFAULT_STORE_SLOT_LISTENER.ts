import type { IOIMStoreSlotListener } from '../../engine/slot/interfaces/IOIMStoreSlotListener';
import { OIMNoStoreSlotListener } from '../../engine/slot/OIMNoStoreSlotListener';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_STORE_SLOT_LISTENER = /* @__PURE__ */ new OIMDefaultValue<IOIMStoreSlotListener>('STORE_SLOT_LISTENER', () => OIMNoStoreSlotListener.INSTANCE);
