import type { TOIMDisposer } from '@oimdb/core';

export type TOIMPersistSourceChangeMarkSubscriptionDrivenOptions = {
    readonly subscribeSourceChanged: (onSourceChanged: () => void) => TOIMDisposer;
};
