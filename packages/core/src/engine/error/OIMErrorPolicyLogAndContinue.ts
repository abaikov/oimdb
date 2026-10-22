import type { IOIMErrorPolicy } from './interfaces/IOIMErrorPolicy';
import type { TOIMErrorPolicyLogAndContinueOptions } from './types/TOIMErrorPolicyLogAndContinueOptions';

export class OIMErrorPolicyLogAndContinue implements IOIMErrorPolicy {
    public static readonly INSTANCE = new OIMErrorPolicyLogAndContinue();

    private readonly onError: ((error: unknown) => void) | undefined;

    public constructor(options?: TOIMErrorPolicyLogAndContinueOptions) {
        this.onError = options?.onError;
    }

    public onErrorCaught(error: unknown): void {
        console.error(error);
        this.onError?.(error);
    }
}
