import { OIMDefaults } from '../../../factories/OIMDefaults';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

const channelService = OIMChannelService.INSTANCE;
const effectService = OIMEffectService.INSTANCE;

/**
 * `dropChannelSlot` is the caller saying "nobody is watching this, kill it
 * fast". The engine takes that on trust — the check would be the walk the method
 * exists to skip — so what has to be pinned is not what it refuses but what it
 * does with the work already in flight, and what it deliberately does NOT do.
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

describe('what a dropped channel does with the frame it already asked for', () => {
    it('the frame the scheduler still holds delivers nothing', () => {
        let armed: (() => void) | undefined;
        const db = new OIMDB({ channelScheduler: flush => { armed = flush; } });
        const slot = makeSlot();
        const ran: string[] = [];
        effectService.createEffect(db, [slot], [], () => { ran.push('a'); });
        channelService.write(db.defaultChannelSlot, slot);
        expect(armed).toBeDefined();

        channelService.dropChannelSlot(db.defaultChannelSlot);
        // The scheduler cannot be recalled: this is the flush it was handed.
        armed?.();
        expect(ran).toEqual([]);
    });

    it('a handler that asked to hear after every frame hears nothing more', () => {
        let armed: (() => void) | undefined;
        const db = new OIMDB({ channelScheduler: flush => { armed = flush; } });
        const slot = makeSlot();
        const told: string[] = [];
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { told.push('after'); });
        effectService.createEffect(db, [slot], [], () => undefined);

        channelService.write(db.defaultChannelSlot, slot);
        channelService.dropChannelSlot(db.defaultChannelSlot);
        armed?.();
        expect(told).toEqual([]);
    });

    it('a flush called by hand after the drop is a no-op rather than a throw', () => {
        const db = new OIMDB();
        const slot = makeSlot();
        const ran: string[] = [];
        effectService.createEffect(db, [slot], [], () => { ran.push('a'); });

        channelService.dropChannelSlot(db.defaultChannelSlot);
        channelService.write(db.defaultChannelSlot, slot);
        expect(() => { db.flush(); }).not.toThrow();
        expect(ran).toEqual([]);
    });

    it('LEAVES THE SUBSCRIBERS WHERE THEY ARE — the bargain the name states', () => {
        const db = new OIMDB();
        const slot = makeSlot();
        effectService.createEffect(db, [slot], [], () => undefined);
        effectService.createEffect(db, [slot], [], () => undefined);

        channelService.dropChannelSlot(db.defaultChannelSlot);
        // Not a leak this method failed to clean: the whole channel is the
        // caller's to drop, and every one of these objects goes with it. What is
        // pinned here is that NOTHING WAS WALKED — a method that unfiled these
        // would be paying the cost this one exists to refuse.
        expect(slot.effects?.length).toBe(2);
    });

    it('stops asking the host for frames it will not run', () => {
        let asked = 0;
        const db = new OIMDB({ channelScheduler: () => { asked++; } });
        const slot = makeSlot();
        effectService.createEffect(db, [slot], [], () => undefined);
        channelService.write(db.defaultChannelSlot, slot);
        expect(asked).toBe(1);

        channelService.dropChannelSlot(db.defaultChannelSlot);
        channelService.write(db.defaultChannelSlot, slot);
        channelService.write(db.defaultChannelSlot, makeSlot());
        // A write after the drop is not refused — but a dropped screen must not
        // keep scheduling work on its host for as long as something writes to it.
        expect(asked).toBe(1);
    });

    it('is safe to call twice', () => {
        const db = new OIMDB();
        channelService.dropChannelSlot(db.defaultChannelSlot);
        expect(() => { channelService.dropChannelSlot(db.defaultChannelSlot); }).not.toThrow();
        expect(() => { db.flush(); }).not.toThrow();
    });
});
