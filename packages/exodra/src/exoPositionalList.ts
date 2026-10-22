import type { TExoListOp } from '@exodra/reactivity-types';
import type {
    IOIMChannelMap, OIMSlotContentBucketService, TOIMBucketSlot, TOIMEffect, TOIMOrderedListCommand, TOIMSlot,
} from '@oimdb/core';
import { OIMChannelService, OIMEffectService } from '@oimdb/core';
import { OIMExoListSchemas } from './OIMExoListSchemas';
import { OIMExoListSubscribers } from './OIMExoListSubscribers';
import { exoList } from './exoList';
import type { TOIMExoList } from './types/TOIMExoList';

export function exoPositionalList<TBucketMemberSlot extends TOIMSlot, TSlots, TSchema>(
    channelMap: IOIMChannelMap,
    slotContentBucketService: OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
    bucketSlot: TOIMBucketSlot<TSlots>,
    render: (slot: TBucketMemberSlot) => TSchema,
): TOIMExoList<TSchema> {
    const schemas = new OIMExoListSchemas<TSchema, TBucketMemberSlot>(render);
    const subscribers = new OIMExoListSubscribers<TSchema>();

    // Mutated in place, never replaced: this list and the consumer's advance
    // through the same commands, which is what makes an index address both.
    const applied: TBucketMemberSlot[] = Array.from(slotContentBucketService.getBucketMemberSlots(bucketSlot));

    // Read INSIDE the frame: the bucket's commands are emptied once the flush has
    // fully ended, so an effect body is the only place the script still exists.
    let appliedCommandCount = bucketSlot.isWholeListRecorded ? 0 : bucketSlot.commands?.length ?? 0;
    const afterEachFlushDisposer = OIMChannelService.INSTANCE.subscribeAfterEachFlush(
        channelMap.defaultChannelSlot, () => { appliedCommandCount = 0; },
    );
    let effect: TOIMEffect;
    try {
        effect = OIMEffectService.INSTANCE.createEffect(channelMap, [bucketSlot], [], () => {
            const script: readonly TOIMOrderedListCommand[] = bucketSlot.isWholeListRecorded
                ? [{ type: 'reset', slots: Array.from(slotContentBucketService.getBucketMemberSlots(bucketSlot)) }]
                : bucketSlot.commands ?? [];
            const from = bucketSlot.isWholeListRecorded ? 0 : appliedCommandCount;
            appliedCommandCount = bucketSlot.isWholeListRecorded ? 0 : script.length;
            if (script.length <= from) return;
            const ops: TExoListOp<TSchema>[] = new Array(script.length - from);
            for (let i = from; i < script.length; i++) {
                applyOrderedCommand(applied, script[i]);
                ops[i - from] = schemas.opFor(script[i]);
            }
            subscribers.emit(ops);
        });
    } catch (failure) {
        afterEachFlushDisposer();
        throw failure;
    }

    return exoList<TSchema>({
        readSnapshot: () => schemas.snapshotOf(applied),
        subscribers,
        effect,
        disposer: afterEachFlushDisposer,
    });
}

/** The applier a consumer writes, applied to this bridge's own copy of the list. */
function applyOrderedCommand<TBucketMemberSlot extends TOIMSlot>(
    list: TBucketMemberSlot[], command: TOIMOrderedListCommand,
): void {
    switch (command.type) {
        case 'insert':
            list.splice(command.index, 0, command.slot as TBucketMemberSlot);
            return;
        case 'remove':
            list.splice(command.index, 1);
            return;
        case 'move': {
            const moved = list.splice(command.from, 1)[0];
            list.splice(command.to, 0, moved);
            return;
        }
        case 'reset':
            list.length = 0;
            for (let i = 0; i < command.slots.length; i++) list.push(command.slots[i] as TBucketMemberSlot);
            return;
    }
}
