import { OIMEffectService } from '@oimdb/core';
import type { TOIMExoList } from './types/TOIMExoList';
import type { TOIMExoListOptions } from './types/TOIMExoListOptions';

export function exoList<TSchema>(
    options: TOIMExoListOptions<TSchema>
): TOIMExoList<TSchema> {
    const { readSnapshot, subscribers, effect, disposer } = options;
    let disposed = false;
    return {
        snapshot: readSnapshot,
        subscribeOps: update => subscribers.add(update),
        dispose: () => {
            if (disposed) return;
            disposed = true;
            subscribers.clear();
            try {
                OIMEffectService.INSTANCE.disposeEffect(effect);
            } finally {
                disposer?.();
            }
        },
    };
}
