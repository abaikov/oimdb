import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';

export class OIMSlotNeverReleasePolicy implements IOIMSlotReleasePolicy {
    public static readonly INSTANCE = new OIMSlotNeverReleasePolicy();

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
