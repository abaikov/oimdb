import type { TOIMEffect } from '../../computed/types/TOIMEffect';
import type { IOIMSlotOwner } from '../interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from './TOIMStoreSlot';

export type TOIMSlot = {
    readonly effects: TOIMEffect[] | undefined;
    readonly changedAtRevision: number;
    readonly changedAtEpoch: number;
    readonly effectEdges: number[] | undefined;
    readonly holdCount: number;
    readonly releaseDueAfterWriteMs: number;
    readonly releaseDueAfterIdleMs: number;
    readonly releaseDueAfterUnholdMs: number;
    readonly slotFlags: number;
    readonly columnSlotStore: unknown;
    readonly storeSlot: TOIMStoreSlot | undefined;

    readonly owner: IOIMSlotOwner;
};
