/**
 * Payload type for update events that contain keys */
export type TOIMUpdatePayload<TKey> = {
    keys: readonly TKey[];
};
