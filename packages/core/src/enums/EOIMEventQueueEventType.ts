export enum EOIMEventQueueEventType {
    AFTER_FLUSH,
    BEFORE_FLUSH,
    /**
     * A task threw during flush. Emitted once per failing task, ALWAYS (whether
     * or not an `onError` handler is installed) — an observation channel for
     * tooling (devtools / MCP). It does not replace the error being raised: with
     * no `onError` handler the error still propagates out of `flush()`.
     */
    FLUSH_ERROR,
}
