/** Shared no-op used as an unsubscribe fallback when a source exposes no emitter. */
export function noop(): void {
    return undefined;
}
