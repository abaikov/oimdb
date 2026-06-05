import { IOIMAnyPersistResource } from '../interfaces/IOIMAnyPersistResource';
import { TOIMPersistCodec } from '../types/TOIMPersistCodec';
import { TOIMPersistHydrateReconcile } from '../types/TOIMPersistHydrateReconcile';
import { TOIMPersistResourceOptions } from '../types/TOIMPersistResourceOptions';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { TOIMPersistStrategy } from '../types/TOIMPersistStrategy';
import { TOIMPersistUnsubscribe } from '../types/TOIMPersistUnsubscribe';

export class OIMPersistResource<
    TPersistor,
    TSourceSnapshot,
    TPersistedSnapshot = TSourceSnapshot,
> implements IOIMAnyPersistResource<TPersistor> {
    public readonly source: TOIMPersistSourceAdapter<TSourceSnapshot>;
    public readonly strategy: TOIMPersistStrategy<TPersistor, TPersistedSnapshot>;
    public readonly codec?: TOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;

    private unsubscribe?: TOIMPersistUnsubscribe;
    private isHydrating = false;
    private reconcile?: TOIMPersistHydrateReconcile<TSourceSnapshot>;

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
        this.reconcile = options.reconcile;
    }

    /**
     * Sets the hydration reconciler and returns the resource for chaining
     * (e.g. `persistor.collection(c).entry(...).onHydrate(byPk(...))`).
     */
    public onHydrate(
        reconcile: TOIMPersistHydrateReconcile<TSourceSnapshot>
    ): this {
        this.reconcile = reconcile;
        return this;
    }

    public takeSnapshot(): TPersistedSnapshot {
        return this.codec
            ? this.codec.encode(this.source.read())
            : (this.source.read() as unknown as TPersistedSnapshot);
    }

    public applySnapshot(snapshot: TPersistedSnapshot): void {
        const incoming = this.codec
            ? this.codec.decode(snapshot)
            : (snapshot as unknown as TSourceSnapshot);
        // `incoming` carries only the shape/version concern (codec). Merging it
        // with the source's current contents is a separate concern (reconcile),
        // so it reads `source.read()` here rather than living inside the codec.
        const next = this.reconcile
            ? this.reconcile(this.source.read(), incoming)
            : incoming;
        this.isHydrating = true;
        try {
            this.source.write(next);
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
