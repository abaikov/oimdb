import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { TOIMPk } from '../../../type/TOIMPk';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKeys } from './OIMSelectorSourceDependencyUpdateEventEmitterKeys';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

export class OIMCollectionByPksSelector<
    TEntity extends object,
    TPk extends TOIMPk,
> extends OIMSelector<readonly (TEntity | undefined)[]> {
    private readonly pks: readonly TPk[];

    constructor(
        runtime: OIMComputativeRuntime,
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        pks: readonly TPk[]
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKeys<TPk>(
                collection,
                pks
            ),
        ]);
        this.pks = pks;
    }

    public getValue(): readonly (TEntity | undefined)[] {
        return this.pks.map(pk => this.collection.getOneByPk(pk));
    }

    protected areEqual(
        prev: readonly (TEntity | undefined)[],
        next: readonly (TEntity | undefined)[]
    ): boolean {
        if (prev === next) return true;
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++) {
            if (prev[i] !== next[i]) return false;
        }
        return true;
    }
}
