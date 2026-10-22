import type { TOIMDisposer, TOIMEffect } from '@oimdb/core';
import type { OIMExoListSubscribers } from '../OIMExoListSubscribers';
import type { TOIMExoList } from './TOIMExoList';

export type TOIMExoListOptions<TSchema> = {
    readSnapshot: TOIMExoList<TSchema>['snapshot'];
    subscribers: OIMExoListSubscribers<TSchema>;
    effect: TOIMEffect;
    disposer?: TOIMDisposer | undefined;
};
