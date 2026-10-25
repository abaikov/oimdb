import { OIMCompositeKeyTreeWalk } from '../../engine/key/OIMCompositeKeyTreeWalk';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_KEY_TREE_WALK_COMPOSITE = /* @__PURE__ */ new OIMDefaultValue<OIMCompositeKeyTreeWalk>('KEY_TREE_WALK_COMPOSITE', () => OIMCompositeKeyTreeWalk.INSTANCE);
