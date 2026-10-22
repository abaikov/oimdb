import type { TExoListOp } from '@exodra/reactivity-types';
import type { IOIMChannelMap, TOIMComputedSlot, TOIMEntitySlot } from '@oimdb/core';
import { OIMEffectService, oimOrderedListCommandsOfTransition } from '@oimdb/core';
import { OIMExoListSchemas } from './OIMExoListSchemas';
import { OIMExoListSubscribers } from './OIMExoListSubscribers';
import { exoList } from './exoList';
import type { TOIMExoList } from './types/TOIMExoList';

export function exoDerivedList<TEntity extends object, TSchema, TKey = unknown>(
    channelMap: IOIMChannelMap,
    computedSlot: TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>,
    render: (slot: TOIMEntitySlot) => TSchema,
    maxCommandsPerSlot?: number,
): TOIMExoList<TSchema> {
    const schemas = new OIMExoListSchemas<TSchema>(render);
    const subscribers = new OIMExoListSubscribers<TSchema>();

    const computedValueService = computedSlot.computedValueService;

    let applied: readonly TOIMEntitySlot<TEntity>[] = computedValueService.getValueForSlot(computedSlot);

    const effect = OIMEffectService.INSTANCE.createEffect(channelMap, [], [computedSlot], () => {
        const next = computedValueService.getValueForSlot(computedSlot);
        // `prev === next` is the one reading `oimOrderedListCommandsOfTransition` cannot be asked about.
        if (next === applied) return;
        const script = oimOrderedListCommandsOfTransition(applied, next, maxCommandsPerSlot);
        applied = next;
        if (script.length === 0) return;
        const ops: TExoListOp<TSchema>[] = new Array(script.length);
        // Mapped ONCE for the round: every subscriber gets the same schema objects.
        for (let i = 0; i < script.length; i++) ops[i] = schemas.opFor(script[i]);
        subscribers.emit(ops);
    });

    return exoList<TSchema>({
        readSnapshot: () => schemas.snapshotOf(applied),
        subscribers,
        effect,
    });
}
