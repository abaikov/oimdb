import type { OIMDB } from '@oimdb/core';
import type { TOIMTrackedSelectorRender } from './TOIMTrackedSelectorRender';

export type TOIMSelectorRender<TValue, TDB extends OIMDB> = {
    readonly value: TValue;
    readonly trackedSelectorRender: TOIMTrackedSelectorRender<TDB> | undefined;
};
