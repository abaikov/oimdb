import type { IOIMEntityWriter } from '../../entity/interfaces/IOIMEntityWriter';
import { createOIMInPlaceEntityWriter } from '../../entity/createOIMInPlaceEntityWriter';
import { OIMDefaultValue } from '../OIMDefaultValue';

export const OIM_DEFAULT_ENTITY_WRITER = /* @__PURE__ */ new OIMDefaultValue<IOIMEntityWriter>(() => createOIMInPlaceEntityWriter());
