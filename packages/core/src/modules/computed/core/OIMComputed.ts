import { OIMEventEmitter } from '../../../core/OIMEventEmitter';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { OIMEffect } from '../../effect/core/OIMEffect';
import { IOIMEffectDependency } from '../../effect/interfaces/IOIMEffectDependency';
import { EOIMComputedEventType } from '../enum/EOIMComputedEventType';
import { TOIMComputedOptions } from '../types/TOIMComputedOptions';
import { TOIMComputedUpdatePayload } from '../types/TOIMComputedUpdatePayload';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

type TOIMComputedKey = 'value';

export class OIMComputed<TValue> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMComputedEventType.UPDATE]: TOIMComputedUpdatePayload<TOIMComputedKey>;
    }>();
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TOIMComputedKey>;

    private readonly runtime: OIMComputativeRuntime;
    private readonly compute: () => TValue;
    private readonly compare: (a: TValue, b: TValue) => boolean;
    private readonly deps: readonly IOIMEffectDependency[];

    private value!: TValue;
    private hasValue = false;
    private isDirty = true;
    private readonly effect: OIMEffect;

    constructor(
        runtime: OIMComputativeRuntime,
        opts: TOIMComputedOptions<TValue>
    ) {
        this.runtime = runtime;
        this.compute = opts.compute;
        this.compare = opts.compare ?? Object.is;
        this.deps = opts.deps ?? [];

        this.updateEventEmitter = new OIMUpdateEventEmitter<TOIMComputedKey>(
            this.runtime.queue,
            'immediate'
        );

        this.effect = new OIMEffect(this.runtime, {
            deps: this.deps,
            onUpdate: () => {
                this.isDirty = true;
            },
            run: () => {
                this.recomputeAndEmitIfChanged();
            },
        });
    }

    public get(): TValue {
        // Ensure value is up to date for direct reads.
        this.recomputeAndEmitIfChanged();
        return this.value;
    }

    public getIfReady(): TValue | undefined {
        return this.hasValue ? this.value : undefined;
    }

    public destroy(): void {
        this.effect.destroy();

        this.updateEventEmitter.destroy();
        this.emitter.offAll();
    }

    private recomputeAndEmitIfChanged(): void {
        if (!this.isDirty) return;

        const prev = this.value;
        const hadPrev = this.hasValue;

        const next = this.compute();
        this.value = next;
        this.hasValue = true;
        this.isDirty = false;

        const changed = !hadPrev || !this.compare(prev, next);
        if (!changed) return;

        this.emitter.emit(EOIMComputedEventType.UPDATE, {
            keys: ['value'],
        });
        this.updateEventEmitter.markUpdatedKey('value');
    }
}
