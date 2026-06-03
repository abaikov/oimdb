import { TOIMPk } from '../types/TOIMPk';
import { TOIMEventHandler } from '../types/TOIMEventHandler';

export interface IOIMKeyedSubscription<TKey extends TOIMPk> {
    subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>): () => void;
    subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void;
}





