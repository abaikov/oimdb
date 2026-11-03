import { OIMDefaults } from '@oimdb/core';
import { OIM_DEV_REGISTRY } from './OIM_DEV_REGISTRY';

export const OIM_DEV_DEFAULTS = new OIMDefaults({ storeSlotListener: OIM_DEV_REGISTRY });
