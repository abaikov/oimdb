import type { IOIMSlotReleaseDueFramePolicy } from './interfaces/IOIMSlotReleaseDueFramePolicy';

export class OIMSlotReleaseManualDueFramePolicy implements IOIMSlotReleaseDueFramePolicy {
    private slotReleaseDueFrameDepth = 0;

    public isSlotReleaseDueFrameOpen(): boolean {
        return this.slotReleaseDueFrameDepth !== 0;
    }

    public openSlotReleaseDueFrame(): void {
        this.slotReleaseDueFrameDepth++;
    }

    public closeSlotReleaseDueFrame(): void {
        if (this.slotReleaseDueFrameDepth === 0) {
            throw new Error(
                'OIMSlotReleaseManualDueFramePolicy.closeSlotReleaseDueFrame: no frame is open. '
                + 'Every closeSlotReleaseDueFrame answers one openSlotReleaseDueFrame.',
            );
        }
        this.slotReleaseDueFrameDepth--;
    }

    public writeInSlotReleaseDueFrame(write: () => void): void {
        this.openSlotReleaseDueFrame();
        try {
            write();
        } finally {
            this.closeSlotReleaseDueFrame();
        }
    }
}
