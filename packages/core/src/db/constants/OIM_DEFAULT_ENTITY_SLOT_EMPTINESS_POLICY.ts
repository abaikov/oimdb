import type { IOIMSlotEmptinessPolicy } from '../../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from '../../entity/types/TOIMEntityContentSlot';
import { OIMSlotEntityPresenceEmptinessPolicy } from '../../entity/OIMSlotEntityPresenceEmptinessPolicy';
import { OIMDefaultValue } from '../OIMDefaultValue';

export const OIM_DEFAULT_ENTITY_SLOT_EMPTINESS_POLICY = /* @__PURE__ */ new OIMDefaultValue<IOIMSlotEmptinessPolicy<TOIMEntityContentSlot>>('ENTITY_SLOT_EMPTINESS_POLICY', () => OIMSlotEntityPresenceEmptinessPolicy.INSTANCE);
