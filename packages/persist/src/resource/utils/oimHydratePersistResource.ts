import type { TOIMPersistResourceHydrateOptions } from '../types/TOIMPersistResourceHydrateOptions';

export async function oimHydratePersistResource<TSnapshot>(
    persistResourceHydrateOptions: TOIMPersistResourceHydrateOptions<TSnapshot>,
): Promise<void> {
    const { persistSnapshotSource, persistSourceSilencer, persistHydrateReconcile } = persistResourceHydrateOptions;
    const persistSourceChangeMark = persistSnapshotSource.markSourceChanges();
    let storedSnapshot: TSnapshot | undefined;
    try {
        storedSnapshot = await persistResourceHydrateOptions.readStoredSnapshot();
        if (
            storedSnapshot !== undefined
            && persistHydrateReconcile === undefined
            && persistSourceChangeMark.isSourceChangedSinceMark()
        ) {
            throw new Error(
                `${persistResourceHydrateOptions.resourceName}.hydrate: the source changed while the stored value was `
                + 'being read, and this resource has no persistHydrateReconcile to merge the two. The stored value was '
                + 'NOT applied, because applying it would revert that change. Pass persistHydrateReconcile, or hydrate '
                + 'before anything can write to the source.',
            );
        }
    } finally {
        persistSourceChangeMark.dispose();
    }
    if (storedSnapshot === undefined) return;
    const incomingSnapshot = storedSnapshot;
    const nextSnapshot = persistHydrateReconcile === undefined
        ? incomingSnapshot
        : persistHydrateReconcile(persistSnapshotSource.readSnapshot(), incomingSnapshot);
    persistSourceSilencer.changeSourceSilently(() => { persistSnapshotSource.writeSnapshot(nextSnapshot); });
}
