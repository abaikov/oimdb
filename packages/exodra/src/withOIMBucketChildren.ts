import { connectExoNode, swapExoParams, wireExoNode, withExoEffects, withExoParamsEffects } from '@exodra/core';
import type { TExoMachine } from '@exodra/core';
import type { TExoDomNode } from '@exodra/dom';
import { OIMBucketCommandsCursor } from '@oimdb/core';
import type { TOIMOrderedListCommand, TOIMSlot } from '@oimdb/core';
import { resolveOIMExodraPlugin } from './resolveOIMExodraPlugin';
import type { TOIMBucketChildrenOptions } from './types/TOIMBucketChildrenOptions';
import type { TOIMExodraNode } from './types/TOIMExodraNode';

export function withOIMBucketChildren<
    TWiring extends TExoDomNode, TPorts, TParams, TState, TBucketMemberSlot extends TOIMSlot,
    TMachine extends TExoMachine<TWiring, TPorts, TParams, TState>,
>(
    machine: TMachine & TExoMachine<TWiring, TPorts, TParams, TState>,
    options: TOIMBucketChildrenOptions<TParams, TWiring, TBucketMemberSlot>,
): TMachine {
    const { childrenPort, memberMachine, selectBucketSlot } = options;
    const parkedSlotsByNode = new WeakMap<object, Set<TOIMSlot>>();
    const parkedSlotsKeeper = withExoEffects(machine, (effect) => {
        effect((c) => () => {
            const parkedSlots = parkedSlotsByNode.get(c);
            if (parkedSlots === undefined) return;
            parkedSlotsByNode.delete(c);
            const exodraPlugin = resolveOIMExodraPlugin(c);
            for (const slot of parkedSlots) exodraPlugin.destroyParkedNode(parkedSlots, slot);
        });
    });
    return withExoParamsEffects(parkedSlotsKeeper, {
        [`oimBucketChildren${childrenPort.index}`]: {
            key: selectBucketSlot,
            start: (c: TWiring & { state: TState }, params: TParams) => {
                const exodraPlugin = resolveOIMExodraPlugin(c);
                const childList = c.portChildList(childrenPort);
                let parkedSlots = parkedSlotsByNode.get(c);
                if (parkedSlots === undefined) {
                    parkedSlots = new Set<TOIMSlot>();
                    parkedSlotsByNode.set(c, parkedSlots);
                }

                const insertAt = (slot: TOIMSlot, index: number): void => {
                    const parkedNode = exodraPlugin.unparkNode(parkedSlots, slot);
                    if (parkedNode !== undefined) {
                        connectExoNode(parkedNode);
                        childList.attach(parkedNode, index);
                        return;
                    }
                    const node = c.createExoNode(memberMachine as never) as unknown as TOIMExodraNode;
                    wireExoNode(node, slot);
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
                const bucketSlot = selectBucketSlot(params);
                const bucketCommandsCursor = new OIMBucketCommandsCursor({ bucketSlot });
                const watchDisposer = bucketSlot.watch(() => { apply(bucketCommandsCursor.takeBucketCommands()); });
                return watchDisposer;
            },
        },
    }) as unknown as TMachine;
}
