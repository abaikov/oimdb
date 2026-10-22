import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { OIMChannelService } from '../OIMChannelService';

type TRow = { n: number };

const withManualScheduler = () => {
    const pending: (() => void)[] = [];
    const db = new OIMDB({ channelScheduler: run => { pending.push(run); } });
    return { db, pending };
};

const recordServiceOn = (db: OIMDB) => createOIMSingleEntityService<TRow>(db);

describe('a sink that arrives mid-batch still gets its frame', () => {
    it('asks the host once a sink subscribes after the batch has begun', () => {
        const { db, pending } = withManualScheduler();
        const recordService = recordServiceOn(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { n: 0 });
        recordService.getSingleSlot(record).owner.holdSlot(recordService.getSingleSlot(record));

        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 1 });
        expect(pending.length).toBe(0);

        let told = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { told++; });
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 2 });

        expect(recordService.getSingleSlot(record).entity).toEqual({ n: 2 });
        expect(pending.length).toBe(1);
        pending[0]();
        expect(told).toBe(1);
    });

    it('asks the host once and not once per write of the batch', () => {
        const { db, pending } = withManualScheduler();
        const recordService = recordServiceOn(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { n: 0 });
        recordService.getSingleSlot(record).owner.holdSlot(recordService.getSingleSlot(record));

        let told = 0;
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 1 });
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { told++; });
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 2 });
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 3 });
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 4 });

        expect(pending.length).toBe(1);
        pending[0]();
        expect(told).toBe(1);
    });

    it('asks for nothing when the channel has no sink either', () => {
        const { db, pending } = withManualScheduler();
        const recordService = recordServiceOn(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { n: 0 });

        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 1 });
        recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), { n: 2 });

        expect(recordService.getSingleSlot(record).entity).toEqual({ n: 2 });
        expect(pending.length).toBe(0);
    });
});
