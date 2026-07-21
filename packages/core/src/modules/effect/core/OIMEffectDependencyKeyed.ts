import { TOIMKey } from '../../../types/TOIMKey';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { IOIMKeyedSubscription } from '../../../interfaces/IOIMKeyedSubscription';

/**
 * Depends on updates to ONE key of a keyed source. The key argument is the whole
 * key — a composite key `[a, b]` is one key, never split — so there is no
 * `key | key[]` ambiguity to guess at. To depend on several keys, use several
 * dependencies (an effect already takes a `deps` array).
 */
export class OIMEffectDependencyKeyed<TKey extends TOIMKey>
    implements IOIMEffectDependency
{
    constructor(
        public readonly source: IOIMKeyedSubscription<TKey>,
        private readonly key: TKey
    ) {}

    public subscribe(onUpdate: () => void): () => void {
        return this.source.subscribeOnKey(this.key, onUpdate);
    }
}
