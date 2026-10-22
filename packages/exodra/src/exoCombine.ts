import { exoSource } from './exoSource';
import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMExoReadable } from './types/TOIMExoReadable';

export function exoCombine<T>(
    sources: readonly TOIMExoReadable<unknown>[],
    fn: () => T
): TExoBindable<T> {
    let last: T;
    let hasLast = false;
    return exoSource(fn, onChange => {
        // No baseline before subscribing: the first recompute is always a change.
        hasLast = false;
        const recompute = (): void => {
            const next = fn();
            if (hasLast && Object.is(last, next)) return;
            last = next;
            hasLast = true;
            onChange();
        };
        const stops: Array<() => void> = [];
        try {
            for (const exoReadable of sources) stops.push(exoReadable.subscribe(recompute));
        } catch (failure) {
            // THE FAN-IN IS ALL OR NOTHING, unwound in reverse. Under `sources.map`
            // the disposers of 0..k-1 reach nobody.
            for (let i = stops.length - 1; i >= 0; i--) stops[i]();
            hasLast = false;
            throw failure;
        }
        return () => {
            for (const stop of stops) stop();
            hasLast = false;
        };
    });
}
