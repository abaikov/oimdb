import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';
import { fromOimdb } from './fromOimdb';

/**
 * Combine several bindables into one derived read-only bindable — Exodra's `derive` is single-source
 * only. `fn` recomputes the combined value; it should read `getValue()` from the sources it depends
 * on. Lazy and ref-counted like every other bindable here: the sources are subscribed once while at
 * least one downstream subscriber exists, not once per subscriber.
 *
 * Unlike the adapters, this one DOES dedup by default (`equals`, `Object.is`) — it is not a
 * transport, it owns the value it computes, so the policy belongs to it. That default also does the
 * only glitch control available at this layer: N sources reacting to one logical change notify N
 * times, and recomputes that land on the same value collapse to a single downstream notification.
 * Pass a content compare when `fn` returns a fresh container.
 *
 * It is NOT glitch-free, and cannot be: Exodra has no batching, and this sees bare bindables with no
 * queue to coalesce on. Sources that change together still produce an intermediate recompute, which
 * is visible whenever the combined value genuinely differs at each step. For real fan-in, do the
 * join inside ONE `OIMComputed` (leveled at AFTER_FLUSH, coherent by construction) and wrap it with
 * `fromComputed`; reach for `combine` when the sources move independently.
 */
export function combine<T>(
    sources: readonly TOIMExodraReadable<unknown>[],
    fn: () => T,
    opts?: TOIMExodraBindableOptions<T>
): TExoBindable<T> {
    return fromOimdb(
        fn,
        onChange => {
            const stops = sources.map(source =>
                source.subscribe(() => onChange())
            );
            return () => {
                for (const stop of stops) stop();
            };
        },
        { equals: opts?.equals ?? Object.is }
    );
}
