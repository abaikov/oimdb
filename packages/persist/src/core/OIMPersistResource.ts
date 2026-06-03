import {
    TOIMPersistCodec,
    TOIMPersistSourceAdapter,
    TOIMPersistStrategy,
    TOIMPersistUnsubscribe,
} from '../types/TOIMPersistResource';

export type TOIMPersistResourceOptions<
    TPersistor,
    TSourceSnapshot,
    TPersistedSnapshot,
> = {
    source: TOIMPersistSourceAdapter<TSourceSnapshot>;
    strategy: TOIMPersistStrategy<TPersistor, TPersistedSnapshot>;
    codec?: TOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;
};

export class OIMPersistResource<
    TPersistor,
    TSourceSnapshot,
    TPersistedSnapshot = TSourceSnapshot,
> {
    public readonly source: TOIMPersistSourceAdapter<TSourceSnapshot>;
    public readonly strategy: TOIMPersistStrategy<TPersistor, TPersistedSnapshot>;
    public readonly codec?: TOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;

    private unsubscribe?: TOIMPersistUnsubscribe;
    private isHydrating = false;

    constructor(
        options: TOIMPersistResourceOptions<
            TPersistor,
            TSourceSnapshot,
            TPersistedSnapshot
        >
    ) {
        this.source = options.source;
        this.strategy = options.strategy;
        this.codec = options.codec;
    }

    public takeSnapshot(): TPersistedSnapshot {
        return this.codec
            ? this.codec.encode(this.source.read())
            : (this.source.read() as unknown as TPersistedSnapshot);
    }

    public applySnapshot(snapshot: TPersistedSnapshot): void {
        const decoded = this.codec
            ? this.codec.decode(snapshot)
            : (snapshot as unknown as TSourceSnapshot);
        this.isHydrating = true;
        try {
            this.source.write(decoded);
        } finally {
            this.isHydrating = false;
        }
    }

    public start(onDirty: () => void): void {
        if (this.unsubscribe) return;
        this.unsubscribe = this.source.subscribe(() => {
            if (this.isHydrating) return;
            onDirty();
        });
    }

    public stop(): void {
        if (!this.unsubscribe) return;
        this.unsubscribe();
        this.unsubscribe = undefined;
    }
}
