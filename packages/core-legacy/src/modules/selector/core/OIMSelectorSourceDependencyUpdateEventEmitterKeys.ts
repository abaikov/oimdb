import type { TOIMKey } from '../../../types/TOIMKey';
import type { IOIMSelectorSourceDependency } from '../interfaces/IOIMSelectorSourceDependency';
import type { IOIMKeyedSubscription } from '../../../interfaces/IOIMKeyedSubscription';

export class OIMSelectorSourceDependencyUpdateEventEmitterKeys<
    TKey extends TOIMKey,
> implements IOIMSelectorSourceDependency
{
    private readonly keys: readonly TKey[];

    constructor(
        private readonly subscription: IOIMKeyedSubscription<TKey>,
        keys: readonly TKey[]
    ) {
        this.keys = keys;
    }

    public subscribe(onUpdate: () => void): () => void {
        return this.subscription.subscribeOnKeys(this.keys, onUpdate);
    }
}
