import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { TOIMPk } from '../../../type/TOIMPk';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyEntitiesByIndexKeyArrayBased } from './OIMSelectorSourceDependencyEntitiesByIndexKeyArrayBased';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

export class OIMEntitiesByIndexKeyArrayBasedSelector<
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMSelector<readonly (TEntity | undefined)[]> {
    constructor(
        runtime: OIMComputativeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveIndexArrayBased<
            TKey,
            TPk,
            TIndex
        >,
        private readonly key: TKey
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyEntitiesByIndexKeyArrayBased<
                TEntity,
                TPk,
                TKey,
                TIndex
            >(collection, reactiveIndex, key),
        ]);
    }

    public getValue(): readonly (TEntity | undefined)[] {
        const pks = this.reactiveIndex.getPksByKey(this.key);
        return pks.map(pk => this.collection.getOneByPk(pk));
    }

    protected areEqual(
        prev: readonly (TEntity | undefined)[],
        next: readonly (TEntity | undefined)[]
    ): boolean {
        if (prev === next) return true;
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++)
            if (prev[i] !== next[i]) return false;
        return true;
    }
}
