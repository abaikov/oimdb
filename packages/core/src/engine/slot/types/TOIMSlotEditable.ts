export type TOIMSlotEditable<TSlot> = { -readonly [K in keyof TSlot]: TSlot[K] };
