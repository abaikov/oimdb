import type { IOIMIndexKeysService } from '../../engine/index/interfaces/IOIMIndexKeysService';
import { OIMIndexKeysServiceAppending } from '../../engine/index/OIMIndexKeysServiceAppending';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_INDEX_KEYS_SERVICE = /* @__PURE__ */ new OIMDefaultValue<IOIMIndexKeysService>('INDEX_KEYS_SERVICE', () => OIMIndexKeysServiceAppending.INSTANCE);
