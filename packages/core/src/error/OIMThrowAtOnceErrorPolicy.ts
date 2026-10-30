import type { IOIMErrorPolicy } from './interfaces/IOIMErrorPolicy';

export class OIMThrowAtOnceErrorPolicy implements IOIMErrorPolicy {
    public onErrorCaught(error: unknown): void {
        throw error;
    }
}
