export interface IOIMDevComputedLike {
    needsRecompute: boolean;
    isReady: boolean;
    getIfReady(): unknown;
}
