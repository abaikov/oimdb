import type { TExoBindable } from '@exodra/reactivity-types';

/**
 * The base primitive: a bare `(read, subscribe)` pair becomes a read-only Exodra bindable. Every
 * other bindable in this package is built on it.
 *
 * - **Lazy and ref-counted** — `subscribe` is called only while at least one downstream subscriber
 *   exists and torn down when the last one leaves, so cost is O(visible), not O(total).
 * - **SSR-safe** — `getValue()` reads through to the store and is valid with no subscription at all.
 * - **Every upstream emit is forwarded.** There is no equality option: `subscribe` is a callback YOU
 *   write, so a caller that wants no-op emits dropped compares in it and does not call `onChange`.
 *
 * ```ts
 * const theme = exoSource(read, onChange => {
 *     let last = read();
 *     return settings.subscribeOnKey('theme', () => {
 *         const next = read();
 *         if (Object.is(next, last)) return;
 *         last = next;
 *         onChange();
 *     });
 * });
 * ```
 */
export function exoSource<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void
): TExoBindable<T> {
    const subscribers = new Set<() => void>();
    let upstreamUnsub: (() => void) | undefined;
    // Many OIMDB sources (a selector's `watch`) fire synchronously on subscribe. `getValue` already
    // carries that value, so an emit during the subscription window is a no-op, not a change.
    let priming = false;

    const onUpstreamChange = () => {
        if (priming) return;
        // Snapshot so a subscriber may (un)subscribe during notification without skipping/looping.
        for (const subscriber of Array.from(subscribers)) {
            if (subscribers.has(subscriber)) subscriber();
        }
    };

    return {
        getValue: read,
        subscribe(update) {
            subscribers.add(update);
            if (subscribers.size === 1) {
                priming = true;
                upstreamUnsub = subscribe(onUpstreamChange);
                priming = false;
            }
            return () => {
                subscribers.delete(update);
                if (subscribers.size === 0) {
                    upstreamUnsub?.();
                    upstreamUnsub = undefined;
                }
            };
        },
    };
}
