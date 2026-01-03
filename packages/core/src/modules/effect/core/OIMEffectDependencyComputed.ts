import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';
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
 *
 * - PRE: subscribe directly to computed.emitter for immediate invalidation during pre-drain.
 * - HANDLERS: subscribe via computed.updateEventEmitter (normal handlers) which is delivered through queue.
 */
export class OIMEffectDependencyComputed implements IOIMEffectDependency {
    constructor(private readonly computed: TOIMComputedLike) {}

    public subscribe(
        phase: EOIMEffectPhase,
        onInvalidate: () => void
    ): () => void {
        if (phase === EOIMEffectPhase.PRE) {
            return this.computed.emitter.on('update', onInvalidate);
        }

        return this.computed.updateEventEmitter.subscribeOnKey(
            'value',
            onInvalidate
        );
    }
}
