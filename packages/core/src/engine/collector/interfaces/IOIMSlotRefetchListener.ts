import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export interface IOIMSlotRefetchListener {
    onSlotsRefetchDue(slots: readonly TOIMSlot[]): void;
}
