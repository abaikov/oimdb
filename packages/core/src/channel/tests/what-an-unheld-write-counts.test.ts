import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIM_REVISIONS_PER_EPOCH } from '../constants/OIM_REVISIONS_PER_EPOCH';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import { createOIMStoreSlot } from '../../slot/utils/createOIMStoreSlot';
import { TestSlotOwner } from '../../../tests/support/TestSlotOwner';

const testStoreSlot = createOIMStoreSlot(undefined, new OIMDB().defaultChannelSlot, undefined);
const makeSlot = (key: string) => createOIMEntitySlot<{ n: number }, string>(key, new TestSlotOwner(), testStoreSlot);

describe('what a write to a slot nobody holds counts', () => {
    it('counts the write and leaves the revision and the slot stamp alone', () => {
        const db = new OIMDB();
        const slot = makeSlot('a');
        const changedAtRevision = slot.changedAtRevision;
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, slot);
        expect(db.clock).toEqual({ revision: 0, epoch: 0, unheldSlotWriteCount: 1 });
        expect(slot.changedAtRevision).toBe(changedAtRevision);
    });

    it('does not count a write to a held slot, which moves the revision instead', () => {
        const db = new OIMDB();
        const slot = makeSlot('a');
        OIMEffectService.INSTANCE.createEffect(db, () => undefined, [slot]);
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, slot);
        expect(db.clock).toEqual({ revision: 1, epoch: 0, unheldSlotWriteCount: 0 });
    });

    it('wraps to zero at the end of the range a revision has', () => {
        const db = new OIMDB();
        db.clock.unheldSlotWriteCount = OIM_REVISIONS_PER_EPOCH - 1;
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, makeSlot('a'));
        expect(db.clock.unheldSlotWriteCount).toBe(0);
    });
});
