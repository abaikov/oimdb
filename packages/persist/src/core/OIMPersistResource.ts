import { IOIMAnyPersistResource } from '../interfaces/IOIMAnyPersistResource';
import { TOIMPersistCodec } from '../types/TOIMPersistCodec';
import { TOIMPersistDelta } from '../types/TOIMPersistDelta';
import { TOIMPersistHydrateReconcile } from '../types/TOIMPersistHydrateReconcile';
import { TOIMPersistResourceOptions } from '../types/TOIMPersistResourceOptions';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { TOIMPersistStrategy } from '../types/TOIMPersistStrategy';
import { TOIMPersistUnsubscribe } from '../types/TOIMPersistUnsubscribe';

export class OIMPersistResource<
    TPersistor,
    TSourceSnapshot,
    TPersistedSnapshot = TSourceSnapshot,
    TKey = unknown,
    TValue = unknown,
> implements IOIMAnyPersistResource<TPersistor> {
    public readonly source: TOIMPersistSourceAdapter<
        TSourceSnapshot,
        TKey,
        TValue
    >;
    public readonly strategy: TOIMPersistStrategy<
        TPersistor,
        TPersistedSnapshot,
        TKey,
        TValue
    >;
    public readonly codec?: TOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;

    private unsubscribe?: TOIMPersistUnsubscribe;
    private isHydrating = false;
    private reconcile?: TOIMPersistHydrateReconcile<TSourceSnapshot>;

    constructor(
        options: TOIMPersistResourceOptions<
            TPersistor,
            TSourceSnapshot,
            TPersistedSnapshot,
            TKey,
            TValue
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

    /**
     * Whether changes can be persisted key-by-key: the source exposes a keyed
     * capability AND the strategy knows how to write a delta. When either is
     * missing the engine falls back to a full-snapshot write.
     */
    public supportsDelta(): boolean {
        return (
            this.source.keyed !== undefined &&
            typeof this.strategy.writeDelta === 'function'
        );
    }

    public takeDelta(keys: readonly TKey[]): TOIMPersistDelta<TKey, TValue> {
        // Guarded by supportsDelta() at the call sites; the keyed capability is
        // therefore present. The whole-snapshot codec deliberately does not
        // apply here — a delta strategy owns its per-key storage format.
        return this.source.keyed!.readDelta(keys);
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

    public start(onDirty: (keys?: readonly TKey[]) => void): void {
        if (this.unsubscribe) return;
        // Only subscribe at key granularity when a delta can actually be
        // written — otherwise a whole-snapshot resource would pay to build and
        // carry key arrays it never uses.
        if (this.supportsDelta()) {
            this.unsubscribe = this.source.keyed!.subscribeKeys(keys => {
                if (this.isHydrating) return;
                onDirty(keys);
            });
        } else {
            this.unsubscribe = this.source.subscribe(() => {
                if (this.isHydrating) return;
                onDirty();
            });
        }
    }

    public stop(): void {
        if (!this.unsubscribe) return;
        this.unsubscribe();
        this.unsubscribe = undefined;
    }
}
