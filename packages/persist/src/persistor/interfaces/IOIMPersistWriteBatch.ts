export interface IOIMPersistWriteBatch {
    commit(): Promise<void>;
}
