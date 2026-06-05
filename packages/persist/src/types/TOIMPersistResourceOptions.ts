import { TOIMPersistCodec } from './TOIMPersistCodec';
import { TOIMPersistHydrateReconcile } from './TOIMPersistHydrateReconcile';
import { TOIMPersistSourceAdapter } from './TOIMPersistSourceAdapter';
import { TOIMPersistStrategy } from './TOIMPersistStrategy';

export type TOIMPersistResourceOptions<
    TPersistor,
    TSourceSnapshot,
    TPersistedSnapshot,
> = {
    source: TOIMPersistSourceAdapter<TSourceSnapshot>;
    strategy: TOIMPersistStrategy<TPersistor, TPersistedSnapshot>;
    codec?: TOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;
    /**
     * Optional hydration reconciler. When set, `hydrate()` combines the loaded
     * snapshot with the source's current contents instead of replacing them.
     */
    reconcile?: TOIMPersistHydrateReconcile<TSourceSnapshot>;
};
