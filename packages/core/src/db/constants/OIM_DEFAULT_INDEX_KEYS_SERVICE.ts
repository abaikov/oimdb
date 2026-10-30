import type { IOIMIndexKeysService } from '../../index/interfaces/IOIMIndexKeysService';
import { OIMAppendingIndexKeysService } from '../../index/OIMAppendingIndexKeysService';
import { OIMDefaultValue } from '../OIMDefaultValue';

export const OIM_DEFAULT_INDEX_KEYS_SERVICE = /* @__PURE__ */ new OIMDefaultValue<IOIMIndexKeysService>('INDEX_KEYS_SERVICE', () => OIMAppendingIndexKeysService.INSTANCE);
