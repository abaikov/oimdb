import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMDisposer } from '@oimdb/core';

export type TOIMExoDisposable<TValue> = TExoBindable<TValue> & {
    readonly dispose: TOIMDisposer;
};
