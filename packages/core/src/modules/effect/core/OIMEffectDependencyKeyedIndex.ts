import { TOIMPk } from '../../../types/TOIMPk';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';
import { IOIMKeyedSubscription } from '../../../interfaces/IOIMKeyedSubscription';

export class OIMEffectDependencyKeyedIndex<TKey extends TOIMPk>
    implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TKey>;

    constructor(
        index: IOIMKeyedSubscription<TKey>,
        key: TKey
    );
    constructor(
        index: IOIMKeyedSubscription<TKey>,
        keys: readonly TKey[]
    );
    constructor(
        index: IOIMKeyedSubscription<TKey>,
        keyOrKeys: TKey | readonly TKey[]
    ) {
        this.dep = new OIMEffectDependencyKeyed<TKey>(
            index,
            keyOrKeys
        );
    }

    public get source(): IOIMKeyedSubscription<TKey> {
        return this.dep.source;
    }

    public subscribe(
        onUpdate: () => void
    ): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
