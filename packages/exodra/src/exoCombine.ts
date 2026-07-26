import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';
import { exoBindable } from './exoBindable';

/**
 * Combine several bindables into one derived read-only bindable — Exodra's `derive` is single-source
 * only. `fn` recomputes the combined value; it should read `getValue()` from the sources it depends
 * on. Lazy and ref-counted: the sources are subscribed once while at least one downstream subscriber
 * exists, not once per subscriber.
 *
 * Recomputes that land on the same value are dropped, which is the only glitch control available at
 * this layer: N sources reacting to one logical change notify N times, and the redundant ones
 * collapse into a single downstream notification.
 *
 * Comparison is `Object.is`, with no option to change it — because `fn` is yours. If you want
 * content-level dedup, return a STABLE REFERENCE from `fn` when the content is unchanged (memoize
 * inside it, exactly as `exoChildren` does); then identity comparison suppresses correctly. One
 * concept instead of two, and it also keeps the value itself stable for whoever reads it.
 *
 * It is NOT glitch-free, and cannot be: Exodra has no batching, and this sees bare bindables with no
 * queue to coalesce on. Sources that change together still produce an intermediate recompute, which
 * is visible whenever the combined value genuinely differs at each step. For real fan-in, do the
 * join inside ONE `OIMComputed` (leveled at AFTER_FLUSH, coherent by construction) and wrap it with
 * `fromComputed`; reach for `exoCombine` when the sources move independently.
 */
export function exoCombine<T>(
    sources: readonly TOIMExodraReadable<unknown>[],
    fn: () => T
): TExoBindable<T> {
    return exoBindable(fn, onChange => {
        let last = fn();
        const stops = sources.map(source =>
            source.subscribe(() => {
                const next = fn();
                if (Object.is(last, next)) return;
                last = next;
                onChange();
            })
        );
        return () => {
            for (const stop of stops) stop();
        };
    });
}
