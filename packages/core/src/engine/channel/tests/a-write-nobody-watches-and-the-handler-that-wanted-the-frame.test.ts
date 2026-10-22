import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { OIMChannelService } from '../OIMChannelService';

type Rec = { n: number };

const recordOn = (db: OIMDB) => {
    const recordService = createOIMSingleEntityService<Rec>(db);
    const record = recordService.createStoreSlot(db);
    recordService.slotContentService.upsertEntity(record, { n: 0 });
    return { recordService, record };
};

describe('a write nobody holds, and the handler that wanted the frame', () => {
    it('asks for no frame and runs no after-each-frame handler for a write to a slot nobody holds', () => {
        const pending: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (run): void => { pending.push(run); } });
        let told = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { told++; });

        const { recordService, record } = recordOn(db);
        const revisionBefore = recordService.getSingleSlot(record).changedAtRevision;
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 1 });

        expect(recordService.getSingleSlot(record).entity).toEqual({ n: 1 });
        expect(recordService.getSingleSlot(record).changedAtRevision).toBe(revisionBefore);
        expect(pending.length).toBe(0);
        expect(told).toBe(0);
    });

    it('asks for a frame and runs the handler once the slot is held', () => {
        const pending: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (run): void => { pending.push(run); } });
        let told = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { told++; });

        const { recordService, record } = recordOn(db);
        recordService.holdSingleSlot(record);
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 1 });

        expect(pending.length).toBe(1);
        while (pending.length > 0) pending.shift()!();
        expect(told).toBe(1);
    });

    it('keeps the one-shot promise of subscribeOnceAfterFrame for a held slot', () => {
        const pending: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (run): void => { pending.push(run); } });
        let told = 0;
        OIMChannelService.INSTANCE.subscribeOnceAfterFrame(db.defaultChannelSlot, () => { told++; });

        const { recordService, record } = recordOn(db);
        recordService.holdSingleSlot(record);
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 1 });
        while (pending.length > 0) pending.shift()!();

        expect(told).toBe(1);
    });
});
