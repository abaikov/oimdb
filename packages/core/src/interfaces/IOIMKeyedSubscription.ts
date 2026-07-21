import { TOIMKey } from '../types/TOIMKey';
import { TOIMEventHandler } from '../types/TOIMEventHandler';

export interface IOIMKeyedSubscription<TKey extends TOIMKey> {
    subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>): () => void;
    subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void;
}





