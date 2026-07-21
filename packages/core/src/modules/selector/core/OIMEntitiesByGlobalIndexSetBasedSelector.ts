import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveGlobalIndexSetBased } from '../../../abstract/OIMReactiveGlobalIndexSetBased';
import { OIMGlobalIndexSetBased } from '../../../abstract/OIMGlobalIndexSetBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyEntitiesByGlobalIndexSetBased } from './OIMSelectorSourceDependencyEntitiesByGlobalIndexSetBased';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMEntitiesByGlobalIndexSetBasedSelector<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
> extends OIMSelector<readonly (TEntity | undefined)[]> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveGlobalIndexSetBased<
            TPk,
            TIndex
        >
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyEntitiesByGlobalIndexSetBased<
                TEntity,
                TPk,
                TIndex
            >(collection, reactiveIndex),
        ]);
    }

    public getValue(): readonly (TEntity | undefined)[] {
        const pks = this.reactiveIndex.getPks();
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
