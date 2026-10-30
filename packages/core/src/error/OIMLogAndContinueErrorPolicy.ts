import type { IOIMErrorPolicy } from './interfaces/IOIMErrorPolicy';
import type { TOIMLogAndContinueErrorPolicyOptions } from './types/TOIMLogAndContinueErrorPolicyOptions';

export class OIMLogAndContinueErrorPolicy implements IOIMErrorPolicy {
    public static readonly INSTANCE = new OIMLogAndContinueErrorPolicy();

    private readonly onError: ((error: unknown) => void) | undefined;

    public constructor(options?: TOIMLogAndContinueErrorPolicyOptions) {
        this.onError = options?.onError;
    }

    public onErrorCaught(error: unknown): void {
        console.error(error);
        this.onError?.(error);
    }
}
