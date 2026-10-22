import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';

export class OIMSlotReleasePolicyAtUnhold implements IOIMSlotReleasePolicy {
    public static readonly INSTANCE = new OIMSlotReleasePolicyAtUnhold();

    public readonly releasesWrittenSlots = true;

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
        return true;
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(): void {
        return;
    }
}
