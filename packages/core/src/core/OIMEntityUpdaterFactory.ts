import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';
import { createMergeEntityUpdater } from './createMergeEntityUpdater';

export class OIMEntityUpdaterFactory<TEntity extends object> {
    createMergeEntityUpdater(): TOIMEntityUpdater<TEntity> {
        return createMergeEntityUpdater<TEntity>();
    }
}
