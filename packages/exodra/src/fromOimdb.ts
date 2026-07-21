import type { TExoBindable } from '@exodra/reactivity';
import type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';

/**
 * The single adapter. Wrap a `(read, subscribe)` pair from oimdb into a read-only Exodra bindable.
 *
 * - `getValue()` reads fresh from `read()` every call — the store is the source of truth, so it is
 *   valid without an active subscription (SSR / string-render safe).
 * - The upstream subscription is LAZY and ref-counted: `subscribe` is called only while this
 *   bindable has at least one downstream subscriber, and torn down when the last one leaves. This
 *   folds the mount/unmount dance into ref-counting → cost is O(visible), not O(total).
 * - `equals` (or `alwaysNotify`) suppresses empty emits so identical re-reads do not churn the DOM.
 */
export function fromOimdb<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void,
    opts?: TOIMExodraBindableOptions<T>
): TExoBindable<T> {
    const equals = opts?.alwaysNotify
        ? () => false
        : (opts?.equals ?? Object.is);

    const subscribers = new Set<() => void>();
    let upstreamUnsub: (() => void) | undefined;
    let lastValue: T;
    let hasLast = false;
    // Guards the initial (synchronous) subscription window: many oimdb sources — e.g. selector
    // `watch` — invoke the change callback immediately, which for set/array reads is a fresh
    // reference each time and would slip past `equals`. `getValue` already carries the initial
    // value, so we swallow any emit that fires while subscribing and keep the primed baseline.
    let priming = false;

    const onUpstreamChange = () => {
        const next = read();
        if (hasLast && equals(lastValue, next)) return;
        if (priming) return;
        lastValue = next;
        hasLast = true;
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
                lastValue = read();
                hasLast = true;
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
