import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveGlobalIndexArrayBased } from '../../../abstract/OIMReactiveGlobalIndexArrayBased';
import { OIMGlobalIndexArrayBased } from '../../../abstract/OIMGlobalIndexArrayBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyEntitiesByGlobalIndexArrayBased } from './OIMSelectorSourceDependencyEntitiesByGlobalIndexArrayBased';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMEntitiesByGlobalIndexArrayBasedSelector<
    TEntity extends object,
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
> extends OIMSelector<readonly (TEntity | undefined)[]> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveGlobalIndexArrayBased<
            TPk,
            TIndex
        >
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyEntitiesByGlobalIndexArrayBased<
                TEntity,
                TPk,
                TIndex
            >(collection, reactiveIndex),
        ]);
    }

    public getValue(): readonly (TEntity | undefined)[] {
        const pks = this.reactiveIndex.getPks();
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
