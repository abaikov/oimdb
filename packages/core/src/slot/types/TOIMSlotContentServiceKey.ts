export type TOIMSlotContentServiceKey<TSlotContentService> = TSlotContentService extends {
    createSlot(key: infer TKey, ...rest: never[]): unknown;
} ? Extract<TKey, NonNullable<unknown>> : never;
