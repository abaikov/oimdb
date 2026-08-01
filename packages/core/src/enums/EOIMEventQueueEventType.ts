export enum EOIMEventQueueEventType {
    AFTER_FLUSH,
    /**
     * The frame is over: tasks drained AND effects finished. Carriers hold their
     * change records right up to here, so anything that clears per-frame state
     * hangs off this rather than AFTER_FLUSH — which fires BEFORE the effects
     * that still need to read it.
     */
    FRAME_END,
    BEFORE_FLUSH,
    /**
     * A task threw during flush. Emitted once per failing task, ALWAYS (whether
     * or not an `onError` handler is installed) — an observation channel for
     * tooling (devtools / MCP). It does not replace the error being raised: with
     * no `onError` handler the error still propagates out of `flush()`.
     */
    FLUSH_ERROR,
}
