import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import { TOIMPk } from '../../../type/TOIMPk';
import { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyEntitiesByIndexKeySetBased } from './OIMSelectorSourceDependencyEntitiesByIndexKeySetBased';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

export class OIMEntitiesByIndexKeySetBasedSelector<
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelector<readonly (TEntity | undefined)[]> {
    constructor(
        runtime: OIMComputativeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveIndexSetBased<
            TKey,
            TPk,
            TIndex
        >,
        private readonly key: TKey
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyEntitiesByIndexKeySetBased<
                TEntity,
                TPk,
                TKey,
                TIndex
            >(collection, reactiveIndex, key),
        ]);
    }

    public getValue(): readonly (TEntity | undefined)[] {
        const pks = Array.from(this.reactiveIndex.getPksByKey(this.key));
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
