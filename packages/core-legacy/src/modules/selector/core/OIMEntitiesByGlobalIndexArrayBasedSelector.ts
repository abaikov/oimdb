import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import type { OIMReactiveGlobalIndexArrayBased } from '../../../abstract/OIMReactiveGlobalIndexArrayBased';
import type { OIMGlobalIndexArrayBased } from '../../../abstract/OIMGlobalIndexArrayBased';
import { OIMSelectorArrayValued } from './OIMSelectorArrayValued';
import { OIMSelectorSourceDependencyEntitiesByGlobalIndexArrayBased } from './OIMSelectorSourceDependencyEntitiesByGlobalIndexArrayBased';
import type { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMEntitiesByGlobalIndexArrayBasedSelector<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
> extends OIMSelectorArrayValued<TEntity | undefined> {
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
}
