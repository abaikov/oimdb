import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';

export class OIMSlotReleasePolicyAtEmpty implements IOIMSlotReleasePolicy {
    public static readonly INSTANCE = new OIMSlotReleasePolicyAtEmpty();

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
        return true;
    }

    public cancelSlotRelease(): void {
        return;
    }
}
