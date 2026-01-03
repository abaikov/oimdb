import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { TOIMPkSelector } from './TOIMPkSelector';
import { TOIMPk } from './TOIMPk';
import { TOIMEntityUpdater } from './TOIMEntityUpdater';

export type TOIMCollectionOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    selectPk?: TOIMPkSelector<TEntity, TPk>;
    store?: OIMCollectionStore<TEntity, TPk>;
    updateEntity?: TOIMEntityUpdater<TEntity>;
};
