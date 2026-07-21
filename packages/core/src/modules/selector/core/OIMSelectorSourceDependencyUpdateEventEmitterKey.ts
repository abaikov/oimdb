import { TOIMKey } from '../../../types/TOIMKey';
import { TOIMPk } from '../../../types/TOIMPk';
import { IOIMSelectorSourceDependency } from '../interfaces/IOIMSelectorSourceDependency';
import { IOIMKeyedSubscription } from '../../../interfaces/IOIMKeyedSubscription';

export class OIMSelectorSourceDependencyUpdateEventEmitterKey<
    TKey extends TOIMKey,
> implements IOIMSelectorSourceDependency
{
    constructor(
        private readonly subscription: IOIMKeyedSubscription<TKey>,
        private readonly key: TKey
    ) {}

    public subscribe(onUpdate: () => void): () => void {
        return this.subscription.subscribeOnKey(this.key, onUpdate);
    }
}
