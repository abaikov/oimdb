import { OIMDefaults } from '../../../factories/OIMDefaults';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMEffectService } from '../OIMEffectService';
import type { TOIMEffect } from '../types/TOIMEffect';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

/**
 * A detach takes ITS OWN edge off a list and nobody else's.
 *
 * The list is no longer in subscription order — `OIMEffectService.disposeEffect` swaps the
 * last entry into the hole rather than splicing, because splicing made taking N
 * subscribers off one identity quadratic in N. What that costs is order, which
 * nothing promises. What it must NOT cost is a live subscriber, and every case
 * below is a way it could.
 */
const makeSlot = (): TOIMSlot => ({
    effects: undefined,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    effectEdges: undefined,
    holdCount: 0,
    slotFlags: OIM_SLOT_FLAG_EMPTY,
    releaseDueAfterWriteMs: -1,
        releaseDueAfterIdleMs: -1,
        releaseDueAfterUnholdMs: -1,
    columnSlotStore: undefined,
    storeSlot: undefined,
    owner: OIMDefaults.STANDALONE_SLOT_OWNER.getValue(),
});

/** Wake everybody on this identity and report who ran, in the order they ran. */
const flushAfterWrite = (db: OIMDB, slot: TOIMSlot, ran: string[]): string[] => {
    ran.length = 0;
    OIMChannelService.INSTANCE.write(db.defaultChannelSlot, slot);
    db.flush();
    return [...ran].sort();
};

describe('what a detach takes off a shared identity', () => {
    it('leaves every other subscriber on the identity', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const slot = makeSlot();
        const ran: string[] = [];
        const names = ['a', 'b', 'c', 'd', 'e'];
        const effects = new Map<string, TOIMEffect>();
        for (const name of names) {
            effects.set(name, effectService.createEffect(db, [slot], [], () => { ran.push(name); }));
        }
        expect(flushAfterWrite(db, slot, ran)).toEqual(['a', 'b', 'c', 'd', 'e']);

        // The MIDDLE one, which is the entry a swap-remove relocates another over.
        effectService.disposeEffect(effects.get('c')!);
        expect(flushAfterWrite(db, slot, ran)).toEqual(['a', 'b', 'd', 'e']);

        // And the one the swap just relocated, whose remembered position changed.
        effectService.disposeEffect(effects.get('e')!);
        expect(flushAfterWrite(db, slot, ran)).toEqual(['a', 'b', 'd']);

        effectService.disposeEffect(effects.get('a')!);
        effectService.disposeEffect(effects.get('b')!);
        effectService.disposeEffect(effects.get('d')!);
        expect(flushAfterWrite(db, slot, ran)).toEqual([]);
        expect(slot.effects?.length ?? 0).toBe(0);
    });

    it('a second detach of the same effect takes nobody else off', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const slot = makeSlot();
        const ran: string[] = [];
        const a = effectService.createEffect(db, [slot], [], () => { ran.push('a'); });
        const b = effectService.createEffect(db, [slot], [], () => { ran.push('b'); });
        effectService.createEffect(db, [slot], [], () => { ran.push('c'); });

        effectService.disposeEffect(a);
        // Without the mark this reads the position `c` was relocated into and
        // unfiles a live subscriber: no throw, and `c` is never woken again.
        effectService.disposeEffect(a);
        effectService.disposeEffect(a);
        expect(flushAfterWrite(db, slot, ran)).toEqual(['b', 'c']);

        effectService.disposeEffect(b);
        expect(flushAfterWrite(db, slot, ran)).toEqual(['c']);
    });

    it('detaching in mount order and in reverse order leave the same list', () => {
        const forwards = new OIMDB();
        const backwards = new OIMDB();
        const forwardsEffectService = OIMEffectService.INSTANCE;
        const backwardsEffectService = OIMEffectService.INSTANCE;
        const one = makeSlot();
        const other = makeSlot();
        const ranOne: string[] = [];
        const ranOther: string[] = [];
        const first: TOIMEffect[] = [];
        const second: TOIMEffect[] = [];
        for (let i = 0; i < 6; i++) {
            first.push(forwardsEffectService.createEffect(forwards, [one], [], () => { ranOne.push(`x${i}`); }));
            second.push(backwardsEffectService.createEffect(backwards, [other], [], () => { ranOther.push(`x${i}`); }));
        }
        for (let i = 0; i < 3; i++) forwardsEffectService.disposeEffect(first[i]);
        for (let i = 5; i >= 3; i--) backwardsEffectService.disposeEffect(second[i]);

        expect(flushAfterWrite(forwards, one, ranOne)).toEqual(['x3', 'x4', 'x5']);
        expect(flushAfterWrite(backwards, other, ranOther)).toEqual(['x0', 'x1', 'x2']);
        expect(one.effects?.length).toBe(3);
        expect(other.effects?.length).toBe(3);
    });

    it('takes the effect off every identity it reads, not only the first', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const left = makeSlot();
        const right = makeSlot();
        const ran: string[] = [];
        const both = effectService.createEffect(db, [left, right], [], () => { ran.push('both'); });
        effectService.createEffect(db, [right], [], () => { ran.push('right'); });

        effectService.disposeEffect(both);
        expect(flushAfterWrite(db, left, ran)).toEqual([]);
        expect(flushAfterWrite(db, right, ran)).toEqual(['right']);
        expect(left.effects?.length ?? 0).toBe(0);
        expect(right.effects?.length).toBe(1);
    });
});
