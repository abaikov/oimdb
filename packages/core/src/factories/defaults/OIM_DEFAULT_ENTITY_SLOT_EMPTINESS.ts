import type { IOIMSlotEmptinessPolicy } from '../../engine/slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from '../../engine/entity/types/TOIMEntityContentSlot';
import { OIMSlotEntityPresenceEmptinessPolicy } from '../../engine/entity/OIMSlotEntityPresenceEmptinessPolicy';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_ENTITY_SLOT_EMPTINESS = /* @__PURE__ */ new OIMDefaultValue<IOIMSlotEmptinessPolicy<TOIMEntityContentSlot>>('ENTITY_SLOT_EMPTINESS', () => OIMSlotEntityPresenceEmptinessPolicy.INSTANCE);
