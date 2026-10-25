export interface IOIMSlotEmptinessPolicy<TSlot> {
    isEmpty(slot: TSlot): boolean;
}
