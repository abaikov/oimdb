import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';

/**
 * Combine several bindables into one derived read-only bindable — Exodra's `derive` is single-source
 * only. Lazy by construction: it subscribes to `sources` only while it itself has a subscriber.
 *
 * `fn` recomputes the combined value; it should read `getValue()` from the sources it depends on.
 */
export function combine<T>(
    sources: readonly TOIMExodraReadable<unknown>[],
    fn: () => T
): TExoBindable<T> {
    return {
        getValue: fn,
        subscribe(update) {
            const stops = sources.map(source => source.subscribe(() => update()));
            return () => {
                for (const stop of stops) stop();
            };
        },
    };
}
