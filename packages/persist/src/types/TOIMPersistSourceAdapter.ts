import { TOIMPersistKeyedCapability } from './TOIMPersistKeyedCapability';
import { TOIMPersistUnsubscribe } from './TOIMPersistUnsubscribe';

export type TOIMPersistSourceAdapter<
    TSnapshot,
    TKey = unknown,
    TValue = unknown,
> = {
    read(): TSnapshot;
    write(snapshot: TSnapshot): void;
    subscribe(onChange: () => void): TOIMPersistUnsubscribe;
    /**
     * Optional key-granular capability. When present (and the strategy supports
     * `writeDelta`), the engine persists only the keys that changed instead of
     * the whole snapshot. Absent for whole-blob sources.
     */
    keyed?: TOIMPersistKeyedCapability<TKey, TValue>;
};
