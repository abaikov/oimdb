import type { IOIMSlotReleaseDueFramePolicy } from '../interfaces/IOIMSlotReleaseDueFramePolicy';

export type TOIMSlotAfterWriteReleasePolicyOptions = {
    keepAfterWriteMs: number;
    slotReleaseDueFramePolicy?: IOIMSlotReleaseDueFramePolicy;
};
