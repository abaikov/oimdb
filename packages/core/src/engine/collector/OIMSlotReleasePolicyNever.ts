import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';

export class OIMSlotReleasePolicyNever implements IOIMSlotReleasePolicy {
    public static readonly INSTANCE = new OIMSlotReleasePolicyNever();

    public readonly releasesWrittenSlots = false;

    public readonly schedulesReleaseOnWrite = false;

    public onSlotWritten(): void {
        return;
    }

    public onSlotIdle(): boolean {
        return false;
    }

    public onSlotUnheld(): void {
        return;
    }

    public isSlotReleasable(): boolean {
        return false;
    }

    public isEmptySlotReleasable(): boolean {
        return false;
    }

    public cancelSlotRelease(): void {
        return;
    }
}
