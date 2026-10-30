import type { TOIMSlotWheelOptions } from './TOIMSlotWheelOptions';
import type { IOIMSlotRefetchListener } from '../interfaces/IOIMSlotRefetchListener';

export type TOIMSlotRefetchWheelOptions = Partial<TOIMSlotWheelOptions> & {
    slotRefetchListener: IOIMSlotRefetchListener;
};
