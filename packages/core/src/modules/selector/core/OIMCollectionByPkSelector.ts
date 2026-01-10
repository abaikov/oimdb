import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { TOIMPk } from '../../../type/TOIMPk';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

export class OIMCollectionByPkSelector<
    TEntity extends object,
    TPk extends TOIMPk,
> extends OIMSelector<TEntity | undefined> {
    constructor(
        runtime: OIMComputativeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly pk: TPk
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKey<TPk>(
                collection,
                pk
            ),
        ]);
    }

    public getValue(): TEntity | undefined {
        return this.collection.getOneByPk(this.pk);
    }
}
