import type { IOIMSlotEmptiness } from '../../engine/slot/interfaces/IOIMSlotEmptiness';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import { OIMSlotEmptinessByEntityPresence } from '../../engine/entity/OIMSlotEmptinessByEntityPresence';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_ENTITY_SLOT_EMPTINESS = /* @__PURE__ */ new OIMDefaultValue<IOIMSlotEmptiness<TOIMEntitySlot>>('ENTITY_SLOT_EMPTINESS', () => OIMSlotEmptinessByEntityPresence.INSTANCE);
