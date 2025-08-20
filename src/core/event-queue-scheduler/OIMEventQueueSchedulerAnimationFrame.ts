import { OIMEventQueueScheduler } from '../../abstract/OIMEventQueueScheduler';

/**
 * Animation frame-based scheduler that executes flushes synchronized with the browser's repaint cycle.
 * Ideal for UI-related updates that need to be synchronized with rendering.
 * Falls back to setTimeout in non-browser environments.
 */
export class OIMEventQueueSchedulerAnimationFrame extends OIMEventQueueScheduler {
    protected frameId?: number;
    protected readonly useRequestAnimationFrame: boolean;

    constructor() {
        super();
        // Check if requestAnimationFrame is available (browser environment)
        this.useRequestAnimationFrame =
            typeof requestAnimationFrame !== 'undefined';
    }

    schedule(): void {
        if (this.frameId !== undefined) return;

        if (this.useRequestAnimationFrame) {
            this.frameId = requestAnimationFrame(() => {
                this.frameId = undefined;
                this.flush();
            });
        } else {
            // Fallback for non-browser environments
            this.frameId = setTimeout(() => {
                this.frameId = undefined;
                this.flush();
            }, 16) as unknown as number; // ~60fps
        }
    }

    cancel(): void {
        if (this.frameId === undefined) return;

        if (this.useRequestAnimationFrame) {
            cancelAnimationFrame(this.frameId);
        } else {
            clearTimeout(this.frameId);
        }
        this.frameId = undefined;
    }
}
