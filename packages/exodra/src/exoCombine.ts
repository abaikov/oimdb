import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';

/**
 * Combine several bindables into one derived read-only bindable — Exodra's `derive` is single-source
 * only. `fn` recomputes the combined value; it should read `getValue()` from the sources it depends
 * on. Lazy and ref-counted: the sources are subscribed once while at least one downstream subscriber
 * exists, not once per subscriber.
 *
 * Reach for it whenever a view needs more than one source — a task plus its assignee, an entity plus
 * some local UI state. That is its job, and it does it.
 *
 * **The first emit after subscribing always propagates**, deliberately. OIMDB sources fire
 * synchronously when subscribed (a selector's `watch` calls back immediately), and a binding is
 * normally built from `getValue()` first and wired a moment later. Anything that changed in between
 * is only recoverable through that first emit — suppressing it as "redundant" leaves the region
 * showing whatever was there at build time, forever. A redundant repaint is the cheap failure mode;
 * a permanently stale region is not.
 *
 * Later emits are deduped: recomputes landing on the same value collapse, which absorbs the N
 * notifications N sources produce for one logical change. For content-level dedup, return a stable
 * reference from `fn`.
 *
 * It is not glitch-free — Exodra has no batching and there is no queue here to coalesce on, so
 * sources changing together produce an intermediate recompute. That is a reason to keep heavy fan-in
 * inside one `OIMComputed` and forward it with `exoComputed`, NOT a reason to avoid this function
 * for ordinary two-source view values.
 */
export function exoCombine<T>(
    sources: readonly TOIMExodraReadable<unknown>[],
    fn: () => T
): TExoBindable<T> {
    const subscribers = new Set<() => void>();
    // Mirrors the sole member while `subscribers.size === 1` — see the fast path in the notifier.
    let onlySubscriber: (() => void) | undefined;
    let stops: (() => void)[] = [];
    let last: T;
    let hasLast = false;

    const onSourceChange = () => {
        const next = fn();
        if (hasLast && Object.is(last, next)) return;
        last = next;
        hasLast = true;
        // One subscriber is the overwhelmingly common case — a bindable feeds a single binding — and
        // snapshotting a one-element Set on every emit is pure allocation. The snapshot below only
        // exists so a subscriber may (un)subscribe DURING notification; with exactly one there is
        // nothing to skip or revisit, and `only` is captured before the call so a subscriber added
        // from inside it is not run this round.
        if (subscribers.size === 1) {
            const only = onlySubscriber;
            if (only) only();
            return;
        }
        // Snapshot so a subscriber may (un)subscribe during notification without skipping/looping.
        for (const subscriber of Array.from(subscribers)) {
            if (subscribers.has(subscriber)) subscriber();
        }
    };

    return {
        getValue: fn,
        subscribe(update) {
            subscribers.add(update);
            onlySubscriber = subscribers.size === 1 ? update : undefined;
            if (subscribers.size === 1) {
                // No baseline is taken before subscribing: with `hasLast` false, the synchronous
                // emit a source fires on subscribe reaches the view instead of being swallowed.
                hasLast = false;
                stops = sources.map(source => source.subscribe(onSourceChange));
            }
            return () => {
                subscribers.delete(update);
                onlySubscriber =
                    subscribers.size === 1
                        ? (subscribers.values().next().value as () => void)
                        : undefined;
                if (subscribers.size === 0) {
                    for (const stop of stops) stop();
                    stops = [];
                    hasLast = false;
                }
            };
        },
    };
}
