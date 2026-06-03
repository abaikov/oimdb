import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEventEmitter } from '../../../core/OIMEventEmitter';
import type { TOIMComputedUpdatePayload } from '../../computed/types/TOIMComputedUpdatePayload';

type TOIMComputedKey = 'value';

type TOIMComputedLike = {
    emitter: OIMEventEmitter<{
        update: TOIMComputedUpdatePayload<TOIMComputedKey>;
    }>;
    updateEventEmitter: OIMUpdateEventEmitter<TOIMComputedKey>;
};

/**
 * Effect dependency on a computed.
 */
export class OIMEffectDependencyComputed implements IOIMEffectDependency {
    constructor(public readonly source: TOIMComputedLike) {}

    public subscribe(onUpdate: () => void): () => void {
        return this.source.emitter.on('update', onUpdate);
    }
}
