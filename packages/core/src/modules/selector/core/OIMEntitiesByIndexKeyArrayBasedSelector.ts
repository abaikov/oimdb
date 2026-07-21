import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyEntitiesByIndexKeyArrayBased } from './OIMSelectorSourceDependencyEntitiesByIndexKeyArrayBased';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMEntitiesByIndexKeyArrayBasedSelector<
    TEntity extends object,
    TPk extends TOIMKey,
    TKey extends TOIMKey,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMSelector<readonly (TEntity | undefined)[]> {
    constructor(
        runtime: OIMComputeRuntime,
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
        const entities: Array<TEntity | undefined> = [];
        entities.length = pks.length;
        for (let i = 0; i < pks.length; i++) {
            entities[i] = this.collection.getOneByPk(pks[i]);
        }
        return entities;
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
