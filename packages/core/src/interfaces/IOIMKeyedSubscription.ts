import { TOIMPk } from '../type/TOIMPk';
import { TOIMEventHandler } from '../type/TOIMEventHandler';

export interface IOIMKeyedSubscription<TKey extends TOIMPk> {
    subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>): () => void;
    subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void;
}





