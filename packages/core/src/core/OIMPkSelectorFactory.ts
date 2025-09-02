import { TOIMPkSelector } from '../types/TOIMPkSelector';
import { TOIMPk } from '../types/TOIMPk';

export class OIMPkSelectorFactory<TEntity extends object, TPk extends TOIMPk> {
    createIdSelector(): TOIMPkSelector<TEntity & { id: TPk }, TPk> {
        return (entity: TEntity & { id: TPk }): TPk => entity.id;
    }
}
