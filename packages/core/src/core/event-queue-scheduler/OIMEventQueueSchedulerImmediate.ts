import { OIMEventQueueScheduler } from '../../abstract/OIMEventQueueScheduler';

type TOIMImmediateSchedulerHandle =
    | ReturnType<typeof setImmediate>
    | ReturnType<typeof setTimeout>
    | 1;

/**
 * Immediate-based scheduler that executes flushes using setImmediate or fallback mechanisms.
 * Provides faster execution than setTimeout(0) in Node.js environments.
 * Falls back to setTimeout(0) in browsers and MessageChannel in modern browsers for better performance.
 */
export class OIMEventQueueSchedulerImmediate extends OIMEventQueueScheduler {
    protected immediateId?: TOIMImmediateSchedulerHandle;
    protected readonly useSetImmediate: boolean;
    protected readonly useMessageChannel: boolean;
    protected messageChannel?: MessageChannel;
    protected pendingCallback?: () => void;

    constructor() {
        super();
        this.useSetImmediate = typeof setImmediate !== 'undefined';
        this.useMessageChannel =
            !this.useSetImmediate &&
            typeof MessageChannel !== 'undefined' &&
            typeof window !== 'undefined';

        if (this.useMessageChannel) {
            this.messageChannel = new MessageChannel();
            this.messageChannel.port2.onmessage = () => {
                if (this.pendingCallback && this.immediateId !== undefined) {
                    const callback = this.pendingCallback;
                    this.pendingCallback = undefined;
                    this.immediateId = undefined;
                    callback();
                }
            };
        }
    }

    schedule(): void {
        if (this.immediateId !== undefined) return;

        const callback = () => {
            this.immediateId = undefined;
            this.flush();
        };

        if (this.useSetImmediate) {
            this.immediateId = setImmediate(callback);
        } else if (this.useMessageChannel && this.messageChannel) {
            // Use MessageChannel for better performance in browsers
            this.immediateId = 1; // Just a flag to indicate pending
            this.pendingCallback = callback;
            this.messageChannel.port1.postMessage(null);
        } else {
            // Fallback to setTimeout(0)
            this.immediateId = setTimeout(callback, 0);
        }
    }

    cancel(): void {
        if (this.immediateId === undefined) return;

        if (this.useSetImmediate) {
            clearImmediate(
                this.immediateId as Parameters<typeof clearImmediate>[0]
            );
        } else if (this.useMessageChannel) {
            this.pendingCallback = undefined;
        } else {
            clearTimeout(this.immediateId as Parameters<typeof clearTimeout>[0]);
        }
        this.immediateId = undefined;
    }
}
