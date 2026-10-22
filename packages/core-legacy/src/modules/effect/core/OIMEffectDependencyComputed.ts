import type { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import type { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import type { OIMEventEmitter } from '../../../core/OIMEventEmitter';
import type { TOIMComputedUpdatePayload } from '../../computed/types/TOIMComputedUpdatePayload';

type TOIMComputedKey = 'value';

type TOIMComputedLike = {
    batchEmitter: OIMEventEmitter<{
        update: TOIMComputedUpdatePayload<TOIMComputedKey>;
    }>;
    emitter: OIMUpdateEventEmitter<TOIMComputedKey>;
};

/**
 * Effect dependency on a computed. Carries the computed itself (`source`) so the
 * runtime can look up its topological depth — the level lives in the runtime,
 * not on this dependency.
 */
export class OIMEffectDependencyComputed implements IOIMEffectDependency {
    constructor(public readonly source: TOIMComputedLike) {}

    public subscribe(onUpdate: () => void): () => void {
        return this.source.batchEmitter.on('update', onUpdate);
    }
}
