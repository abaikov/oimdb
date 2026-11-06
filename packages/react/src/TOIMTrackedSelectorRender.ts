import type { OIMDB } from '@oimdb/core';

export type TOIMTrackedSelectorRender<TDB extends OIMDB> = {
    readonly select: (db: TDB) => unknown;
    readonly trackedAtRevision: number;
    readonly trackedAtEpoch: number;
    readonly trackedAtUnheldSlotWriteCount: number;
};
