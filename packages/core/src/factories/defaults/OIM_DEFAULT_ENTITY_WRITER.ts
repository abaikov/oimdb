import type { IOIMEntityWriter } from '../../engine/entity/interfaces/IOIMEntityWriter';
import { createOIMEntityWriterInPlace } from '../createOIMEntityWriterInPlace';
import { OIMDefaultValue } from './OIMDefaultValue';

export const OIM_DEFAULT_ENTITY_WRITER = /* @__PURE__ */ new OIMDefaultValue<IOIMEntityWriter>('ENTITY_WRITER', () => createOIMEntityWriterInPlace());
