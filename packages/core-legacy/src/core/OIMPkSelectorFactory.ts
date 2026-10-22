import type { TOIMKey } from '../types/TOIMKey';
import type { TOIMPkSelector } from '../types/TOIMPkSelector';

export class OIMPkSelectorFactory<TEntity extends object, TPk extends TOIMKey> {
    createIdSelector(): TOIMPkSelector<TEntity & { id: TPk }, TPk> {
        return (entity: TEntity & { id: TPk }): TPk => entity.id;
    }
}
