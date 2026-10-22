import { exoSource } from './exoSource';
import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMDisposer } from '@oimdb/core';
import type { TOIMExoDisposable } from './types/TOIMExoDisposable';
import type { TOIMExoReadable } from './types/TOIMExoReadable';

export function exoFollowKey<TKey, T>(
    keyExoReadable: TOIMExoReadable<TKey>,
    makeBindable: (key: TKey) => TOIMExoDisposable<T>,
): TExoBindable<T> {
    let exoDisposable: TOIMExoDisposable<T> | undefined;
    let resolvedKey: TKey | undefined;

    const resolve = (nextKey: TKey): TOIMExoDisposable<T> => {
        const heldExoDisposable = exoDisposable;
        if (heldExoDisposable !== undefined && Object.is(resolvedKey, nextKey)) return heldExoDisposable;
        heldExoDisposable?.dispose();
        // EMPTIED BEFORE THE FACTORY RUNS, or a factory that throws leaves the memo
        // crossed: new key beside the handle just disposed.
        exoDisposable = undefined;
        resolvedKey = undefined;
        const resolvedExoDisposable = makeBindable(nextKey);
        exoDisposable = resolvedExoDisposable;
        resolvedKey = nextKey;
        return resolvedExoDisposable;
    };

    const disposeExoDisposable = (): void => {
        exoDisposable?.dispose();
        exoDisposable = undefined;
        resolvedKey = undefined;
    };

    return exoSource(
        () => resolve(keyExoReadable.getValue()).getValue(),
        onChange => {
            let bindableDisposer: TOIMDisposer | undefined;
            const pointAtCurrentKey = (): void => {
                bindableDisposer = resolve(keyExoReadable.getValue()).subscribe(onChange);
            };
            let keyDisposer: TOIMDisposer | undefined;
            try {
                pointAtCurrentKey();
                keyDisposer = keyExoReadable.subscribe(() => {
                    bindableDisposer?.();
                    bindableDisposer = undefined;
                    pointAtCurrentKey();
                    // The key moved, so the value did, even though the new bindable said nothing.
                    onChange();
                });
            } catch (failure) {
                // NOTHING GIVES THIS BACK IF THE THROW LEAVES HERE: the disposer
                // below is the only caller of `disposeExoDisposable()` and is never built.
                bindableDisposer?.();
                bindableDisposer = undefined;
                disposeExoDisposable();
                throw failure;
            }
            return () => {
                bindableDisposer?.();
                bindableDisposer = undefined;
                keyDisposer?.();
                disposeExoDisposable();
            };
        },
    );
}
