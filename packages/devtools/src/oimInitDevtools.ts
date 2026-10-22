import { OIMDefaults } from '@oimdb/core';
import { oimDevRegistry } from './oimDevRegistry';

export function oimInitDevtools(): void {
    OIMDefaults.STORE_SLOT_LISTENER.setValue(oimDevRegistry);
}
