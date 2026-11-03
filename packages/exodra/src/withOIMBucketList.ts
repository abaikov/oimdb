import { connectExoNode, swapExoParams, withExoEffects } from '@exodra/core';
import type { TExoMachine } from '@exodra/core';
import type { TExoDomNode } from '@exodra/dom';
import { OIMBucketCommandsCursor } from '@oimdb/core';
import type { TOIMBucketContentSlot, TOIMBucketSlotsArrayStore, TOIMDisposer, TOIMOrderedListCommand, TOIMSlot } from '@oimdb/core';
import { resolveOIMExodraPlugin } from './resolveOIMExodraPlugin';
import type { TOIMBucketListOptions } from './types/TOIMBucketListOptions';
import type { TOIMExodraNode } from './types/TOIMExodraNode';

export function withOIMBucketList<
    TWiring extends TExoDomNode, TPorts, TParams, TState, TBucketMemberSlot extends TOIMSlot,
    TMachine extends TExoMachine<TWiring, TPorts, TParams, TState>,
>(
    machine: TMachine & TExoMachine<TWiring, TPorts, TParams, TState>,
    options: TOIMBucketListOptions<TWiring & { state: TState }, TWiring, TBucketMemberSlot>,
): TMachine {
    type TBucketSlot = TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>, TBucketMemberSlot>;
    const { selectChildList, memberMachine, selectBucketSlot } = options;
    return withExoEffects(machine, (exoEffect) => {
        exoEffect((c) => {
            const exodraPlugin = resolveOIMExodraPlugin(c);
            const childList = selectChildList(c);
            const parkedSlots = new Set<TOIMSlot>();
            let shownBucketSlot: TBucketSlot | undefined;
            let watchDisposer: TOIMDisposer | undefined;

            const insertAt = (slot: TOIMSlot, index: number): void => {
                const parkedNode = exodraPlugin.unparkNode(parkedSlots, slot);
                if (parkedNode !== undefined) {
                    connectExoNode(parkedNode, memberMachine as TExoMachine<never>);
                    childList.attach(parkedNode, index);
                    return;
                }
                const node = c.build(memberMachine as never, slot) as unknown as TOIMExodraNode;
                swapExoParams(node, slot);
                childList.insert(node, index);
            };
            const parkDetached = (node: TOIMExodraNode): void => {
                exodraPlugin.parkNode(parkedSlots, node.serviceState as TOIMSlot, node);
            };
            const apply = (orderedListCommands: readonly TOIMOrderedListCommand[]): void => {
                for (let i = 0; i < orderedListCommands.length; i++) {
                    const orderedListCommand = orderedListCommands[i];
                    if (orderedListCommand.type === 'insert') insertAt(orderedListCommand.slot, orderedListCommand.index);
                    else if (orderedListCommand.type === 'remove') parkDetached(childList.detach(orderedListCommand.index) as TOIMExodraNode);
                    else if (orderedListCommand.type === 'move') childList.move(orderedListCommand.from, orderedListCommand.to);
                    else {
                        const detachedNodes = childList.detachAll();
                        for (let d = 0; d < detachedNodes.length; d++) parkDetached(detachedNodes[d] as TOIMExodraNode);
                        const slots = orderedListCommand.slots;
                        for (let at = 0; at < slots.length; at++) insertAt(slots[at], at);
                    }
                }
            };
            const selectionDisposer = exodraPlugin.db.createEffect(() => {
                const bucketSlot = selectBucketSlot(c, exodraPlugin.db);
                if (bucketSlot === shownBucketSlot) return;
                watchDisposer?.();
                shownBucketSlot = bucketSlot;
                const bucketCommandsCursor = new OIMBucketCommandsCursor({ bucketSlot });
                watchDisposer = bucketSlot.watch(() => { apply(bucketCommandsCursor.takeBucketCommands()); });
            });
            return () => {
                selectionDisposer();
                watchDisposer?.();
                for (const slot of parkedSlots) exodraPlugin.unparkNode(parkedSlots, slot)?.unmount();
            };
        });
    });
}
