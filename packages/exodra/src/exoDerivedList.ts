import type { TExoListOp } from '@exodra/reactivity-types';
import type { IOIMChannelMap, TOIMComputedContentSlot, TOIMEntitySlot } from '@oimdb/core';
import { OIMEffectService, oimOrderedListCommandsOfTransition } from '@oimdb/core';
import { OIMExoListSchemas } from './OIMExoListSchemas';
import { OIMExoListSubscribers } from './OIMExoListSubscribers';
import { exoList } from './exoList';
import type { TOIMExoList } from './types/TOIMExoList';

export function exoDerivedList<TEntity extends object, TSchema>(
    channelMap: IOIMChannelMap,
    computedSlot: TOIMComputedContentSlot<readonly TOIMEntitySlot<TEntity>[]>,
    render: (slot: TOIMEntitySlot) => TSchema,
    maxCommandsPerSlot?: number,
): TOIMExoList<TSchema> {
    const schemas = new OIMExoListSchemas<TSchema>(render);
    const subscribers = new OIMExoListSubscribers<TSchema>();

    let applied: readonly TOIMEntitySlot<TEntity>[] = computedSlot.value;

    const effect = OIMEffectService.INSTANCE.createEffect(channelMap, () => {
        const next = computedSlot.value;
        // `prev === next` is the one reading `oimOrderedListCommandsOfTransition` cannot be asked about.
        if (next === applied) return;
        const script = oimOrderedListCommandsOfTransition(applied, next, maxCommandsPerSlot);
        applied = next;
        if (script.length === 0) return;
        const ops: TExoListOp<TSchema>[] = new Array(script.length);
        // Mapped ONCE for the round: every subscriber gets the same schema objects.
        for (let i = 0; i < script.length; i++) ops[i] = schemas.opFor(script[i]);
        subscribers.emit(ops);
    }, [], [computedSlot]);

    return exoList<TSchema>({
        readSnapshot: () => schemas.snapshotOf(applied),
        subscribers,
        effect,
    });
}
