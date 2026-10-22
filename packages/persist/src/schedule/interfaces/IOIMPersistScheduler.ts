export interface IOIMPersistScheduler {
    attachDrain(drain: () => void): void;
    start(): void;
    stop(): void;
    requestDrain(): void;
}
