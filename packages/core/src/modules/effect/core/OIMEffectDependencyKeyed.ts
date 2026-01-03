import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { TOIMPk } from '../../../type/TOIMPk';
import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';

function isReadonlyArray<T>(value: unknown): value is readonly T[] {
    return Array.isArray(value);
}

export class OIMEffectDependencyKeyed<TKey extends TOIMPk>
    implements IOIMEffectDependency
{
    private readonly key: TKey | undefined;
    private readonly keys: readonly TKey[] | undefined;

    constructor(
        private readonly updateEventEmitter: OIMUpdateEventEmitter<TKey>,
        keyOrKeys: TKey | readonly TKey[]
    ) {
        if (isReadonlyArray<TKey>(keyOrKeys)) {
            this.keys = keyOrKeys;
        } else {
            this.key = keyOrKeys;
        }
    }

    public subscribe(
        phase: EOIMEffectPhase,
        onInvalidate: () => void
    ): () => void {
        const isPre = phase === EOIMEffectPhase.PRE;

        if (this.keys !== undefined) {
            return isPre
                ? this.updateEventEmitter.subscribeOnKeysBeforeFlush(
                      this.keys,
                      onInvalidate
                  )
                : this.updateEventEmitter.subscribeOnKeys(
                      this.keys,
                      onInvalidate
                  );
        }

        if (this.key === undefined) return () => {};

        return isPre
            ? this.updateEventEmitter.subscribeOnKeyBeforeFlush(
                  this.key,
                  onInvalidate
              )
            : this.updateEventEmitter.subscribeOnKey(this.key, onInvalidate);
    }
}
