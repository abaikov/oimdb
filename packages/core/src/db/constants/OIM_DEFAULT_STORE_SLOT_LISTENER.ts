import type { IOIMStoreSlotListener } from '../../slot/interfaces/IOIMStoreSlotListener';
import { OIMNoStoreSlotListener } from '../../slot/OIMNoStoreSlotListener';
import { OIMDefaultValue } from '../OIMDefaultValue';

export const OIM_DEFAULT_STORE_SLOT_LISTENER = /* @__PURE__ */ new OIMDefaultValue<IOIMStoreSlotListener>('STORE_SLOT_LISTENER', () => OIMNoStoreSlotListener.INSTANCE);
