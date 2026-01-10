import { TOIMPk } from '../../../type/TOIMPk';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { IOIMKeyedSubscription } from '../../../interfaces/IOIMKeyedSubscription';

function isReadonlyArray<T>(value: unknown): value is readonly T[] {
    return Array.isArray(value);
}

export class OIMEffectDependencyKeyed<TKey extends TOIMPk>
    implements IOIMEffectDependency
{
    private readonly key: TKey | undefined;
    private readonly keys: readonly TKey[] | undefined;

    constructor(
        private readonly subscription: IOIMKeyedSubscription<TKey>,
        keyOrKeys: TKey | readonly TKey[]
    ) {
        if (isReadonlyArray<TKey>(keyOrKeys)) {
            this.keys = keyOrKeys;
        } else {
            this.key = keyOrKeys;
        }
    }

    public subscribe(
        onUpdate: () => void
    ): () => void {
        if (this.keys !== undefined) {
            return this.subscription.subscribeOnKeys(this.keys, onUpdate);
        }

        if (this.key === undefined) return () => {};

        return this.subscription.subscribeOnKey(this.key, onUpdate);
    }
}
