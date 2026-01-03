import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { TOIMPk } from '../../../type/TOIMPk';
import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';

export class OIMEffectDependencyKeyedIndex<TKey extends TOIMPk>
    implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TKey>;

    constructor(
        index: { updateEventEmitter: OIMUpdateEventEmitter<TKey> },
        key: TKey
    );
    constructor(
        index: { updateEventEmitter: OIMUpdateEventEmitter<TKey> },
        keys: readonly TKey[]
    );
    constructor(
        index: { updateEventEmitter: OIMUpdateEventEmitter<TKey> },
        keyOrKeys: TKey | readonly TKey[]
    ) {
        this.dep = new OIMEffectDependencyKeyed<TKey>(
            index.updateEventEmitter,
            keyOrKeys
        );
    }

    public subscribe(
        phase: EOIMEffectPhase,
        onInvalidate: () => void
    ): () => void {
        return this.dep.subscribe(phase, onInvalidate);
    }
}
