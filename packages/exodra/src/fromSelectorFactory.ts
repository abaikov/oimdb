import type { TExoBindable } from '@exodra/reactivity-types';
import type { OIMSelector } from '@oimdb/core';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';
import { fromSelector } from './fromSelector';
import { isExoBindable } from './isExoBindable';

/**
 * Reactive-key variant. When `key` is a bindable, the selector is rebuilt whenever the key changes,
 * so a view can follow a moving selection (e.g. the currently selected app) without being recreated.
 * When `key` is a plain value, this is exactly `fromSelector(makeSelector(key))`.
 *
 * Like `fromSelector`, it takes no equality options: the selector currently pointed at owns the
 * dedup (`areEqual`), and this only forwards what that selector delivers, plus one emit per repoint.
 *
 * The pointed-at selector exists only while subscribed, because repointing is driven by the key
 * subscription. `getValue()` therefore builds a throwaway selector from the CURRENT key whenever
 * there is no subscriber — otherwise an unsubscribed read would answer for whatever key was current
 * when this bindable was created, silently breaking the SSR / string-render guarantee. A selector
 * that is never `watch`ed holds no subscriptions, so the throwaway is plain garbage; the cost is one
 * allocation per unsubscribed read, which is the one-shot path, not the hot one.
 */
export function fromSelectorFactory<TKey, T>(
    key: TKey | TOIMExodraReadable<TKey>,
    makeSelector: (key: TKey) => OIMSelector<T>
): TExoBindable<T> {
    if (!isExoBindable<TKey>(key)) {
        return fromSelector(makeSelector(key));
    }

    const keyBindable = key;

    const subscribers = new Set<() => void>();
    // Live only while subscribed — see the note above on unsubscribed reads.
    let selector: OIMSelector<T> | undefined;
    let selectorUnsub: (() => void) | undefined;
    let keyUnsub: (() => void) | undefined;
    let priming = false;

    const notify = () => {
        if (priming) return; // swallow the emit `watch` fires synchronously on (re)subscribe
        for (const subscriber of Array.from(subscribers)) {
            if (subscribers.has(subscriber)) subscriber();
        }
    };

    const pointAtCurrentKey = () => {
        selector = makeSelector(keyBindable.getValue());
        priming = true;
        selectorUnsub = selector.watch(() => notify());
        priming = false;
    };

    const repoint = () => {
        selectorUnsub?.();
        pointAtCurrentKey();
        notify(); // emit once for the newly pointed-at value
    };

    return {
        // Subscribed: read the selector the key subscription keeps repointed. Unsubscribed: nothing
        // is tracking the key, so resolve it now instead of answering for a stale one.
        getValue: () =>
            (selector ?? makeSelector(keyBindable.getValue())).getValue(),
        subscribe(update) {
            subscribers.add(update);
            if (subscribers.size === 1) {
                pointAtCurrentKey();
                keyUnsub = keyBindable.subscribe(() => repoint());
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
