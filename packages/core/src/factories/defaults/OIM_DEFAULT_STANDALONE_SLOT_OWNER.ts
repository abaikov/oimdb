import { OIMSlotOwner } from '../../engine/slot/OIMSlotOwner';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_STANDALONE_SLOT_OWNER = /* @__PURE__ */ new OIMDefaultValue<OIMSlotOwner>('STANDALONE_SLOT_OWNER', () => new OIMSlotOwner());
