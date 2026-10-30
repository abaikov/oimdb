import type { TOIMSlot } from '../types/TOIMSlot';

export interface IOIMSlotSubscriptionListener {
    onSlotFirstSubscribed(slot: TOIMSlot): void;
    onSlotLastUnsubscribed(slot: TOIMSlot): void;
}
