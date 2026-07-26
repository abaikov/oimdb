import type { TExoBindable } from '@exodra/reactivity-types';
import type { OIMSelector } from '@oimdb/core';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';

/**
 * A selector driven by a MOVING key: `makeSelector` is re-run whenever the key bindable changes, so
 * a view follows a selection without being rebuilt.
 *
 * ```ts
 * const members = exoKeyed(selectedTeam, k => kit.select.entitiesBySetIndexKey(byTeam, k));
 * ```
 *
 * The key is always a bindable — a fixed key is `exoSelector(makeSelector(key))`, a different
 * function. Nothing here inspects its argument to work out which of the two you meant.
 *
 * The pointed-at selector exists only while subscribed, because repointing is driven by the key
 * subscription. An unsubscribed `getValue()` therefore resolves the CURRENT key rather than
 * answering for whichever one was current at construction — a never-watched selector holds no
 * subscriptions, so that throwaway is plain garbage.
 */
export function exoKeyed<TKey, T>(
    key: TOIMExodraReadable<TKey>,
    makeSelector: (key: TKey) => OIMSelector<T>
): TExoBindable<T> {
    const subscribers = new Set<() => void>();
    let selector: OIMSelector<T> | undefined;
    let selectorUnsub: (() => void) | undefined;
    let keyUnsub: (() => void) | undefined;
    let priming = false;

    const notify = () => {
        if (priming) return;
        for (const subscriber of Array.from(subscribers)) {
            if (subscribers.has(subscriber)) subscriber();
        }
    };

    const pointAtCurrentKey = () => {
        selector = makeSelector(key.getValue());
        priming = true;
        selectorUnsub = selector.watch(() => notify());
        priming = false;
    };

    return {
        getValue: () => (selector ?? makeSelector(key.getValue())).getValue(),
        subscribe(update) {
            subscribers.add(update);
            if (subscribers.size === 1) {
                pointAtCurrentKey();
                keyUnsub = key.subscribe(() => {
                    selectorUnsub?.();
                    pointAtCurrentKey();
                    notify(); // emit once for the newly pointed-at value
                });
            }
            return () => {
                subscribers.delete(update);
                if (subscribers.size === 0) {
                    selectorUnsub?.();
                    selectorUnsub = undefined;
                    selector = undefined;
                    keyUnsub?.();
                    keyUnsub = undefined;
                }
            };
        },
    };
}
