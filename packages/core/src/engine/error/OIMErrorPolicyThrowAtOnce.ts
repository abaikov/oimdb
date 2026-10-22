import type { IOIMErrorPolicy } from './interfaces/IOIMErrorPolicy';

export class OIMErrorPolicyThrowAtOnce implements IOIMErrorPolicy {
    public onErrorCaught(error: unknown): void {
        throw error;
    }
}
