import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';

/**
 * The single adapter. Wrap a `(read, subscribe)` pair from oimdb into a read-only Exodra bindable.
 *
 * - `getValue()` reads fresh from `read()` every call — the store is the source of truth, so it is
 *   valid without an active subscription (SSR / string-render safe).
 * - The upstream subscription is LAZY and ref-counted: `subscribe` is called only while this
 *   bindable has at least one downstream subscriber, and torn down when the last one leaves. This
 *   folds the mount/unmount dance into ref-counting → cost is O(visible), not O(total).
 * - By default every upstream emit is forwarded: this is a transport, and the source decides what
 *   counts as a change. `equals` is OPT-IN, for the one case where the source has no such policy —
 *   a bare emitter that fires on writes that may not alter the value you read. It is never a default
 *   here, so nothing silently swallows an update the store considered real.
 */
export function fromOimdb<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void,
    opts?: TOIMExodraBindableOptions<T>
): TExoBindable<T> {
    const equals = opts?.equals;

    const subscribers = new Set<() => void>();
    let upstreamUnsub: (() => void) | undefined;
    let lastValue: T;
    let hasLast = false;
    // Guards the initial (synchronous) subscription window: many oimdb sources — e.g. selector
    // `watch` — invoke the change callback immediately. `getValue` already carries that value, so an
    // emit fired while subscribing is a no-op notification, not a change. Independent of `equals`.
    let priming = false;

    const onUpstreamChange = () => {
        if (priming) return;
        if (equals) {
            const next = read();
            if (hasLast && equals(lastValue, next)) return;
            lastValue = next;
            hasLast = true;
        }
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
                if (equals) {
                    lastValue = read();
                    hasLast = true;
                }
                upstreamUnsub = subscribe(onUpstreamChange);
                priming = false;
            }
            return () => {
                subscribers.delete(update);
                if (subscribers.size === 0) {
                    upstreamUnsub?.();
                    upstreamUnsub = undefined;
                    hasLast = false;
                }
            };
        },
    };
}
