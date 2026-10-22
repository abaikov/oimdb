import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import type { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMCollectionByPkSelector<
    TEntity extends object,
    TPk extends TOIMKey,
> extends OIMSelector<TEntity | undefined> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly pk: TPk
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKey<TPk>(
                collection.emitter,
                pk
            ),
        ]);
    }

    public getValue(): TEntity | undefined {
        return this.collection.getOneByPk(this.pk);
    }
}
