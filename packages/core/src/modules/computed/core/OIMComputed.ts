import { EOIMEventQueueEventType } from '../../../enum/EOIMEventQueueEventType';
import { OIMEventEmitter } from '../../../core/OIMEventEmitter';
import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMUpdateEventEmitter } from '../../../core/OIMUpdateEventEmitter';
import { OIMEffect } from '../../effect/core/OIMEffect';
import { EOIMEffectPhase } from '../../effect/enum/EOIMEffectPhase';
import { IOIMEffectDependency } from '../../effect/interfaces/IOIMEffectDependency';
import { EOIMComputedEventType } from '../enum/EOIMComputedEventType';
import { TOIMComputedOptions } from '../types/TOIMComputedOptions';
import { TOIMComputedUpdatePayload } from '../types/TOIMComputedUpdatePayload';
import { OIMUpdateEventCoalescerComputed } from './OIMUpdateEventCoalescerComputed';

type TOIMComputedKey = 'value';

export class OIMComputed<TValue> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMComputedEventType.UPDATE]: TOIMComputedUpdatePayload<TOIMComputedKey>;
    }>();
    public readonly coalescer: OIMUpdateEventCoalescerComputed<TOIMComputedKey>;
    public readonly updateEventEmitter: OIMUpdateEventEmitter<TOIMComputedKey>;

    private readonly queue: OIMEventQueue;
    private readonly compute: () => TValue;
    private readonly compare: (a: TValue, b: TValue) => boolean;
    private readonly deps: readonly IOIMEffectDependency[];

    private value!: TValue;
    private hasValue = false;
    private isDirty = true;
    private isInFlush = false;
    private hasRecomputedInThisFlush = false;
    private readonly effect: OIMEffect;

    private readonly handleQueueBeforeFlush = () => {
        this.isInFlush = true;
        this.hasRecomputedInThisFlush = false;
    };

    private readonly handleQueueAfterFlush = () => {
        this.isInFlush = false;
        this.hasRecomputedInThisFlush = false;
    };

    constructor(queue: OIMEventQueue, opts: TOIMComputedOptions<TValue>) {
        this.queue = queue;
        this.compute = opts.compute;
        this.compare = opts.compare ?? Object.is;
        this.deps = opts.deps ?? [];

        this.coalescer = new OIMUpdateEventCoalescerComputed<TOIMComputedKey>(
            this.emitter
        );
        this.updateEventEmitter = new OIMUpdateEventEmitter<TOIMComputedKey>({
            coalescer: this.coalescer,
            queue: this.queue,
        });

        this.queue.emitter.on(
            EOIMEventQueueEventType.BEFORE_FLUSH,
            this.handleQueueBeforeFlush
        );
        this.queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.handleQueueAfterFlush
        );

        this.effect = new OIMEffect(this.queue, {
            deps: this.deps,
            phase: EOIMEffectPhase.PRE,
            onInvalidate: () => {
                this.isDirty = true;
            },
            run: () => {
                // Coalesce within a flush for computed: recompute at most once even if invalidated by multiple deps.
                if (this.isInFlush) {
                    if (this.hasRecomputedInThisFlush) return;
                    this.hasRecomputedInThisFlush = true;
                }
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

        this.queue.emitter.off(
            EOIMEventQueueEventType.BEFORE_FLUSH,
            this.handleQueueBeforeFlush
        );
        this.queue.emitter.off(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.handleQueueAfterFlush
        );

        this.updateEventEmitter.destroy();
        this.coalescer.destroy();
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
    }
}
