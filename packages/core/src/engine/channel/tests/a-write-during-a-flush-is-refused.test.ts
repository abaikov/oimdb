import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMErrorPolicyThrowAtOnce } from '../../error/OIMErrorPolicyThrowAtOnce';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type Row = { n: number };

const makeSlot = (key: string): TOIMEntitySlot<Row, string> =>
    createOIMEntitySlot<Row, string>(key, new OIMSlotOwner());

const messagesOf = (error: unknown): string => {
    if (error instanceof AggregateError) {
        return error.errors.map(e => (e instanceof Error ? e.message : String(e))).join(' | ');
    }
    return error instanceof Error ? error.message : String(error);
};

const catchThrow = (run: () => void): unknown => {
    try {
        run();
        return undefined;
    } catch (error) {
        return error;
    }
};

const REFUSAL = 'writes are refused for the whole of a flush';

const channelService = OIMChannelService.INSTANCE;

describe('a write during a flush is refused', () => {
    it('refuses a write from onBeforeFlush, which runs with the frame still closed', () => {
        const slot = makeSlot('a');
        const other = makeSlot('b');
        let db: OIMDB | undefined = undefined;
        db = new OIMDB({
            errorPolicy: new OIMErrorPolicyThrowAtOnce(),
            onBeforeFlush: () => { if (db !== undefined) channelService.write(db.defaultChannelSlot, other); },
        });
        channelService.write(db.defaultChannelSlot, slot);

        expect(messagesOf(catchThrow(() => { db?.flush(); }))).toContain(REFUSAL);
    });

    it('refuses a write from an after-each-frame handler, which runs with the frame closed again', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const slot = makeSlot('a');
        const other = makeSlot('b');
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { channelService.write(db.defaultChannelSlot, other); });
        channelService.write(db.defaultChannelSlot, slot);

        expect(messagesOf(catchThrow(() => { db.flush(); }))).toContain(REFUSAL);
    });

    it('refuses a write from inside the frame body', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const effectService = OIMEffectService.INSTANCE;
        const slot = makeSlot('a');
        const other = makeSlot('b');
        effectService.createEffect(db, [slot], [], () => { channelService.write(db.defaultChannelSlot, other); });
        channelService.write(db.defaultChannelSlot, slot);

        expect(messagesOf(catchThrow(() => { db.flush(); }))).toContain(REFUSAL);
    });

    it('takes the write once flush has returned', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const effectService = OIMEffectService.INSTANCE;
        const slot = makeSlot('a');
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });
        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(1);

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(2);
    });

    it('spends exactly one frame per flush, however many handlers ask for another', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const slot = makeSlot('a');
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { db.flush(); });
        channelService.write(db.defaultChannelSlot, slot);

        let framesEnded = 0;
        channelService.subscribeAfterEachFlush(db.defaultChannelSlot, () => { framesEnded++; });
        db.flush();
        expect(framesEnded).toBe(1);
    });
});
