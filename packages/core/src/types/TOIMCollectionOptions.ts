import { TOIMKey } from './TOIMKey';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { TOIMPkSelector } from './TOIMPkSelector';
import { TOIMEntityUpdater } from './TOIMEntityUpdater';

export type TOIMCollectionOptions<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    selectPk?: TOIMPkSelector<TEntity, TPk>;
    /**
     * Backing store. Defaults to `OIMCollectionStoreMapDriven` (native-`Map`,
     * primitive PKs). For a composite PK path, pass
     * `new OIMCollectionStoreTrieDriven()`.
     */
    store?: OIMCollectionStore<TEntity, TPk>;
    updateEntity?: TOIMEntityUpdater<TEntity>;
};
