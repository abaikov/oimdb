import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';

export class OIMEntityUpdaterFactory<TEntity extends object> {
    createMergeEntityUpdater(): TOIMEntityUpdater<TEntity> {
        return (draft, prev) => {
            return { ...prev, ...draft };
        };
    }
}
