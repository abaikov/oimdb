export type TOIMEditable<TSlot> = { -readonly [K in keyof TSlot]: TSlot[K] };
