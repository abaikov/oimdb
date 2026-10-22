import type { TExoBindableList } from '@exodra/reactivity-types';
import type { TOIMDisposer } from '@oimdb/core';

export type TOIMExoList<TSchema> = TExoBindableList<TSchema> & {
    readonly dispose: TOIMDisposer;
};
