import { TOIMPkSelector } from '../type/TOIMPkSelector';
import { TOIMPk } from '../type/TOIMPk';

export class OIMPkSelectorFactory<TEntity extends object, TPk extends TOIMPk> {
    createIdSelector(): TOIMPkSelector<TEntity & { id: TPk }, TPk> {
        return (entity: TEntity & { id: TPk }): TPk => entity.id;
    }
}
