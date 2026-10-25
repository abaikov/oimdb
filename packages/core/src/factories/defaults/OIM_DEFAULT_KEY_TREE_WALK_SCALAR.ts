import { OIMScalarKeyTreeWalk } from '../../engine/key/OIMScalarKeyTreeWalk';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_KEY_TREE_WALK_SCALAR = /* @__PURE__ */ new OIMDefaultValue<OIMScalarKeyTreeWalk>('KEY_TREE_WALK_SCALAR', () => OIMScalarKeyTreeWalk.INSTANCE);
