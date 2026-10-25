import type { IOIMSlotReleaseDueFramePolicy } from './interfaces/IOIMSlotReleaseDueFramePolicy';

export class OIMSlotReleaseAutoDueFramePolicy implements IOIMSlotReleaseDueFramePolicy {
    public static readonly INSTANCE = new OIMSlotReleaseAutoDueFramePolicy();

    public isSlotReleaseDueFrameOpen(): boolean {
        return true;
    }
}
