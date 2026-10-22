import type { TOIMCompositeKeyNode } from '../types/TOIMCompositeKeyNode';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { oimSameSlotSequence } from '../../bucket/utils/oimSameSlotSequence';
import { OIMDB, createOIMEntityService } from '../../../index';

type TNamed = { id: string };

/**
 * A key is refused at both boundaries of the exemption — the container's, and
 * the comparison's.
 *
 * Each call is on ONE line, because a directive covers the line that follows it.
 */
export function aKeyIsNotASegment(): void {
    const node: TOIMCompositeKeyNode = { childNodes: new Map(), atThisKey: undefined };
    // @ts-expect-error the descent files by identity: a number is not a segment
    node.childNodes?.get(Number.NaN);
    // @ts-expect-error and the comparison beside it compares the same thing
    oimSameSlotSequence([Number.NaN], [Number.NaN]);
    // @ts-expect-error a string is not one either — the point is `object`, not `number`
    oimSameSlotSequence(['spades'], ['spades']);
}

/**
 * And the positive half, without which the three refusals above could be
 * passing for a reason that has nothing to do with what a segment is — a wrong
 * arity, a missing export, a signature that takes nothing at all.
 */
export function anIdentityIsASegment(): void {
    const db = new OIMDB();
    const decksService = createOIMEntityService<TNamed>(db, { keyOf: deck => deck.id });
    const decks = decksService.createStoreSlot(db);
    // `hold` and not a read: a read never mints, so `find` answers
    // `TOIMEntitySlot | undefined` and the positive half below would be
    // checking that `undefined` is a segment. The hold is given straight back —
    // what this file needs is the TYPE, and nothing here runs.
    const heldSlot = decksService.holdSlotByKey(decks, 'spades');
    const segment = heldSlot;
    heldSlot.owner.unholdSlot(heldSlot);
    const node: TOIMCompositeKeyNode = { childNodes: new Map(), atThisKey: undefined };
    node.childNodes?.get(segment);
    oimSameSlotSequence([segment], [segment]);
}

/**
 * THE OTHER ARM, AND WHY IT IS HERE RATHER THAN NOWHERE.
 *
 * The three refusals above are only meaningful while a scalar composite key has
 * somewhere else to go; a refusal with no alternative is how the defect this
 * file was written after actually reached a reader. So the arm that DOES take
 * one is named here, at both of the same two boundaries — the container and the
 * comparison beside it — with the segment type spelled out.
 *
 * If the two arms are ever collapsed, this file is where it shows: widening
 * `oimSameSlotSequence` to admit `TOIMStoreKey` makes the `@ts-expect-error`s above suppress
 * nothing.
 */
export function aKeyIsASegmentOfTheOtherArm(): void {
    const node: TOIMCompositeKeyNode<TOIMEntitySlot, TOIMStoreKey> = {
        childNodes: new Map(), atThisKey: undefined,
    };
    node.childNodes?.get(Number.NaN);
    node.childNodes?.get('spades');
}
