
import { OIMDefaults } from '../../../factories/OIMDefaults';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMErrorPolicyThrowAtOnce } from '../../error/OIMErrorPolicyThrowAtOnce';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

const channelService = OIMChannelService.INSTANCE;
const effectService = OIMEffectService.INSTANCE;

const slot = (): TOIMSlot => ({
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

describe('a body that writes during the frame is refused rather than half-honoured', () => {
    it('throws out of the flush, and reaches no reader of the root it tried to write', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const target = slot();
        const trigger = slot();
        const seen: number[] = [];

        // Listed second, so it would run after the writer below.
        effectService.createEffect(db, [target], [], () => { seen.push(target.changedAtRevision); });
        effectService.createEffect(db, [trigger], [], () => { channelService.write(db.defaultChannelSlot, target); });

        channelService.write(db.defaultChannelSlot, trigger);
        // The body's throw is collected like any other and raised once the frame
        // has finished — it does not abort the frame.
        expect(() => { db.flush(); }).toThrow('writes are refused for the whole of a flush');

        // Nothing was written, so the reader was never listed and never ran.
        expect(seen).toEqual([]);
        expect(target.changedAtRevision).toBe(0);
    });

    it('leaves the root exactly as the frame found it, so a legal write still reaches its reader', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const target = slot();
        const trigger = slot();
        const seen: number[] = [];

        effectService.createEffect(db, [target], [], () => { seen.push(target.changedAtRevision); });
        effectService.createEffect(db, [trigger], [], () => { channelService.write(db.defaultChannelSlot, target); });

        // Both move before the frame, so both leaves are listed and the reader
        // runs FIRST.
        channelService.write(db.defaultChannelSlot, target);
        channelService.write(db.defaultChannelSlot, trigger);
        expect(() => { db.flush(); }).toThrow('writes are refused for the whole of a flush');

        expect(seen.length).toBe(1);
        const readAt = seen[0];
        // THE READER IS NOT BEHIND ITS OWN ROOT: the refused write advanced
        // nothing, so there is no reading the reader missed.
        expect(target.changedAtRevision).toBe(readAt);

        // And the ordinary door still works: written after the flush returned,
        // the reader hears about it in the next frame.
        channelService.write(db.defaultChannelSlot, target);
        db.flush();
        expect(seen.length).toBe(2);
        expect(seen[1]).toBeGreaterThan(readAt);
    });
});
