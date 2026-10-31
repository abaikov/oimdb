import { OIMDefaults } from '@oimdb/core';
import { oimDevRegistry } from './oimDevRegistry';

export const oimDevDefaults = new OIMDefaults({ storeSlotListener: oimDevRegistry });
