import type { TExoBindable } from '@exodra/reactivity';
import type { OIMSelector } from '@oimdb/core';
import type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';
import { fromSelector } from './fromSelector';
import { isExoBindable } from './isExoBindable';

/**
 * Reactive-key variant. When `key` is a bindable, the selector is rebuilt whenever the key changes,
 * so a view can follow a moving selection (e.g. the currently selected app) without being recreated.
 * When `key` is a plain value, this is exactly `fromSelector(makeSelector(key))`.
 */
export function fromSelectorFactory<TKey, T>(
    key: TKey | TOIMExodraReadable<TKey>,
    makeSelector: (key: TKey) => OIMSelector<T>,
    opts?: TOIMExodraBindableOptions<T>
): TExoBindable<T> {
    if (!isExoBindable<TKey>(key)) {
        return fromSelector(makeSelector(key), opts);
    }

    const keyBindable = key;
    const equals = opts?.alwaysNotify
        ? () => false
        : (opts?.equals ?? Object.is);

    const subscribers = new Set<() => void>();
    let selector = makeSelector(keyBindable.getValue());
    let selectorUnsub: (() => void) | undefined;
    let keyUnsub: (() => void) | undefined;
    let lastValue: T;
    let hasLast = false;
    let priming = false;

    const notify = () => {
        const next = selector.getValue();
        if (hasLast && equals(lastValue, next)) return;
        if (priming) return; // swallow the selector's immediate emit; keep the primed baseline
        lastValue = next;
        hasLast = true;
        for (const subscriber of Array.from(subscribers)) {
            if (subscribers.has(subscriber)) subscriber();
        }
    };

    const watchCurrent = () => {
        priming = true;
        selectorUnsub = selector.watch(() => notify());
        priming = false;
    };

    const repoint = () => {
        selectorUnsub?.();
        selector = makeSelector(keyBindable.getValue());
        watchCurrent();
        notify(); // emit once for the newly pointed-at value
    };

    return {
        getValue: () => selector.getValue(),
        subscribe(update) {
            subscribers.add(update);
            if (subscribers.size === 1) {
                lastValue = selector.getValue();
                hasLast = true;
                watchCurrent();
                keyUnsub = keyBindable.subscribe(() => repoint());
            }
            return () => {
                subscribers.delete(update);
                if (subscribers.size === 0) {
                    selectorUnsub?.();
                    selectorUnsub = undefined;
                    keyUnsub?.();
                    keyUnsub = undefined;
                    hasLast = false;
                }
            };
        },
    };
}
