export type TOIMChannelFrame = {
    isRunning: boolean;
    openedAtRevision: number;
    openedAtEpoch: number;
    afterEachFrame: Set<() => void>;
};
