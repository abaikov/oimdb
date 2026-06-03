import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyEntitiesByIndexKeySetBased } from './OIMSelectorSourceDependencyEntitiesByIndexKeySetBased';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMEntitiesByIndexKeySetBasedSelector<
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelector<readonly (TEntity | undefined)[]> {
    constructor(
        runtime: OIMComputeRuntime,
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
        const pks = this.reactiveIndex.getPksByKey(this.key);
        const entities: Array<TEntity | undefined> = [];
        entities.length = pks.size;
        let writeIndex = 0;
        for (const pk of pks) {
            entities[writeIndex++] = this.collection.getOneByPk(pk);
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
