/** Payload of the `EOIMEventQueueEventType.FLUSH_ERROR` event. */
export type TOIMFlushError = {
    /** The value a queue task threw (not necessarily an `Error`). */
    error: unknown;
};
